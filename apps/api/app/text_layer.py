"""Decoupled text layering (Pillow).

Renders the AI image as a clean layer, then burns the personalised story line on
top using the placement stored in PageTemplate (textX/textY as % of canvas,
fontSize, fontColor, fontFamily, letterSpacing, softLineBreak). Substitutes
{{name}} and adds a soft outline + drop-shadow so text stays legible over any
illustration.
"""
from __future__ import annotations

import io
import os
import re
from typing import Optional

import httpx
from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont

from .config import settings
from .warp import STYLE_ARC, STYLE_NONE, warp_layer

# Sentence end followed by a space: ". " / "! " / "? " — the split point for the
# text layer's line breaks. Decimals ("4.5") lack the trailing space, so they
# survive intact.
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")

# Bundled in the api image via apt (fonts-dejavu-core). Override with FONT_PATH.
FONT_BOLD = os.getenv(
    "FONT_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
)

_DEJAVU = "/usr/share/fonts/truetype/dejavu"
_LIBERATION = "/usr/share/fonts/truetype/liberation"
_COMIC = "/usr/share/fonts/truetype/comic-neue"

# Selectable families for the page editor. Each entry lists candidate files in
# preference order; the first one present in the image wins, and a family whose
# fonts aren't installed falls back to the default sans. Keep the keys stable —
# they're stored in PageTemplate.fontFamily.
FONT_FAMILIES: dict[str, dict] = {
    "sans": {
        "label": "Sans (DejaVu Bold)",
        "css": "'DejaVu Sans', 'Segoe UI', system-ui, sans-serif",
        "files": [FONT_BOLD, f"{_DEJAVU}/DejaVuSans-Bold.ttf"],
    },
    "sans-regular": {
        "label": "Sans (DejaVu Regular)",
        "css": "'DejaVu Sans', 'Segoe UI', system-ui, sans-serif",
        "files": [f"{_DEJAVU}/DejaVuSans.ttf"],
    },
    "serif": {
        "label": "Serif (DejaVu Bold)",
        "css": "'DejaVu Serif', Georgia, 'Times New Roman', serif",
        "files": [f"{_DEJAVU}/DejaVuSerif-Bold.ttf"],
    },
    "rounded": {
        "label": "Rounded / storybook (Comic Neue Bold)",
        "css": "'Comic Neue', 'Comic Sans MS', 'Segoe UI', cursive",
        "files": [f"{_COMIC}/ComicNeue-Bold.ttf", f"{_COMIC}/ComicNeue-Regular.ttf"],
    },
    "liberation-sans": {
        "label": "Liberation Sans Bold (Arial-like)",
        "css": "'Liberation Sans', Arial, Helvetica, sans-serif",
        "files": [f"{_LIBERATION}/LiberationSans-Bold.ttf"],
    },
    "liberation-serif": {
        "label": "Liberation Serif Bold (Times-like)",
        "css": "'Liberation Serif', 'Times New Roman', serif",
        "files": [f"{_LIBERATION}/LiberationSerif-Bold.ttf"],
    },
    "mono": {
        "label": "Mono (DejaVu Sans Mono Bold)",
        "css": "'DejaVu Sans Mono', ui-monospace, monospace",
        "files": [f"{_DEJAVU}/DejaVuSansMono-Bold.ttf"],
    },
}

DEFAULT_FAMILY = "sans"

# Outline thickness in px at the 1024 design width; 0 = no outline (use that
# when the base art already has a light panel behind the text).
DEFAULT_OUTLINE = 3


# Fonts the admin installs themselves. This lives on the shared storage volume,
# NOT in the image: the worker renders the pages, so anything dropped here has to
# be visible to both containers, and it has to survive a rebuild.
CUSTOM_DIR = os.path.join(settings.storage_dir, "fonts")
CUSTOM_PREFIX = "custom:"
FONT_EXTS = (".ttf", ".otf", ".ttc")


def _custom_files() -> dict[str, str]:
    """{key: path} for every font file the admin has installed."""
    out: dict[str, str] = {}
    try:
        for name in sorted(os.listdir(CUSTOM_DIR)):
            if name.lower().endswith(FONT_EXTS):
                out[CUSTOM_PREFIX + os.path.splitext(name)[0]] = os.path.join(
                    CUSTOM_DIR, name
                )
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return out


def _custom_label(key: str) -> str:
    stem = key[len(CUSTOM_PREFIX):]
    return stem.replace("_", " ").replace("-", " ").strip() or stem


def available_families() -> list[dict]:
    """Family list for the admin UI, flagging which ones are actually installed.

    Built-ins come from the image; anything in CUSTOM_DIR is listed after them,
    so the admin can drop a .ttf/.otf in and have it appear in the picker.
    """
    families = [
        {
            "key": key,
            "label": spec["label"],
            "css": spec["css"],
            "installed": any(os.path.exists(p) for p in spec["files"]),
            "custom": False,
        }
        for key, spec in FONT_FAMILIES.items()
    ]
    for key, path in _custom_files().items():
        families.append(
            {
                "key": key,
                "label": _custom_label(key),
                # The browser can't load a server-side font file, so the editor
                # preview approximates it; the burned-in text uses the real one.
                "css": "'Segoe UI', system-ui, sans-serif",
                "installed": os.path.exists(path),
                "custom": True,
            }
        )
    return families


def outline_color(font_color: str) -> tuple[int, int, int]:
    """The halo colour for a given text colour.

    It has to CONTRAST with the text — a black outline around black text just
    fattens and smears the glyphs instead of separating them from the artwork.
    So light text gets a black halo and dark text gets a white one.
    """
    try:
        r, g, b = ImageColor.getrgb(font_color or "#FFFFFF")[:3]
    except Exception:
        r, g, b = (255, 255, 255)
    # Rec. 601 luma — good enough to ask "is this text light or dark?"
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    return (0, 0, 0) if luma >= 140 else (255, 255, 255)


def personalize(text: str, child_name: str) -> str:
    return (text or "").replace("{{name}}", child_name).replace("{{Name}}", child_name)


def _load_font(size: int, family: str = DEFAULT_FAMILY) -> ImageFont.FreeTypeFont:
    family = family or DEFAULT_FAMILY
    custom: list[str] = []
    if family.startswith(CUSTOM_PREFIX):
        path = _custom_files().get(family)
        if path:
            custom.append(path)
    spec = FONT_FAMILIES.get(family, FONT_FAMILIES[DEFAULT_FAMILY])
    candidates = [
        # An admin-installed font wins; if its file has since been deleted we
        # fall through to the built-ins rather than failing the whole render.
        *custom,
        *spec["files"],
        # Fall back to the default family, then to any DejaVu that exists.
        *FONT_FAMILIES[DEFAULT_FAMILY]["files"],
        f"{_DEJAVU}/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _load_image(src: str) -> Image.Image:
    # Our own uploads live on a shared volume - read them locally so the worker
    # doesn't have to HTTP-fetch (its localhost isn't the API).
    if "/uploads/" in src:
        name = src.split("/uploads/", 1)[1]
        return Image.open(os.path.join(settings.storage_dir, name)).convert("RGB")
    if src.startswith("http"):
        data = httpx.get(src, timeout=60).content
        return Image.open(io.BytesIO(data)).convert("RGB")
    return Image.open(src).convert("RGB")


def _text_w(draw: ImageDraw.ImageDraw, text: str, font, tracking: float) -> float:
    """Advance width of `text` including per-character letter spacing."""
    w = draw.textlength(text, font=font)
    if tracking and text:
        # Tracking is applied between glyphs, not after the last one.
        w += tracking * (len(text) - 1)
    return w


def _draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font,
    fill,
    tracking: float,
    stroke_width: int = 0,
    stroke_fill=None,
) -> None:
    """draw.text() with letter spacing (glyph-by-glyph when tracking != 0).

    Outlining goes through Pillow's own stroke_width, which renders a real
    anti-aliased outline in one pass.
    """
    kw = {"font": font, "fill": fill}
    if stroke_width:
        kw["stroke_width"] = stroke_width
        kw["stroke_fill"] = stroke_fill
    if not tracking:
        draw.text(xy, text, **kw)
        return
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, **kw)
        x += draw.textlength(ch, font=font) + tracking


def _wrap(
    draw: ImageDraw.ImageDraw,
    text: str,
    font,
    max_w: int,
    tracking: float = 0.0,
    soft_line_break: bool = True,
) -> list[str]:
    """Wrap to max_w.

    With soft_line_break on (the default) each sentence also starts a new line,
    which keeps the block narrow enough to sit inside the authored text panel; a
    single sentence wider than max_w still wraps on words. With it off, the whole
    line flows and only wraps when it runs out of width.
    """
    chunks = _SENTENCE_END.split(text.strip()) if soft_line_break else [text.strip()]
    lines: list[str] = []
    for chunk in chunks:
        if not chunk:
            continue
        cur = ""
        for w in chunk.split():
            trial = f"{cur} {w}".strip()
            if _text_w(draw, trial, font, tracking) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
    return lines


# One styled text block. A page holds a list of these, so a cover can stack
# three rows in three fonts, three colours and three sizes — the single-block
# fields on PageTemplate are just the first entry.
BLOCK_DEFAULTS = {
    "text": "",
    "textX": 50.0,
    "textY": 82.0,
    "fontSize": 42,
    "fontColor": "#FFFFFF",
    "fontFamily": DEFAULT_FAMILY,
    "letterSpacing": 0.0,
    "softLineBreak": True,
    "outlineWidth": DEFAULT_OUTLINE,
    "outlineColor": "",       # "" = auto-contrast against the text colour
    "shadow": True,
    # Panel behind the text, so type stays readable over busy artwork.
    "boxEnabled": False,
    "boxColor": "#FFFFFF",
    "boxOpacity": 70,      # 0 = invisible, 100 = solid
    "boxPadding": 26,      # px @1024 around the text
    "boxRadius": 22,       # px @1024 corner rounding
    "boxFullWidth": False, # span the page instead of hugging the text
    "warpStyle": STYLE_NONE,
    "warpBend": 0.0,
    "warpDistortH": 0.0,
    "warpDistortV": 0.0,
    "warpVertical": False,
}


def _draw_block(img: Image.Image, block: dict, child_name: str) -> Image.Image:
    """Burn one styled block onto the page and return the new image."""
    b = {**BLOCK_DEFAULTS, **(block or {})}
    text = personalize(str(b["text"] or ""), child_name)
    if not text.strip():
        return img

    W, H = img.size
    scale = W / 1024
    size = max(12, int(float(b["fontSize"]) * scale))
    font = _load_font(size, str(b["fontFamily"] or DEFAULT_FAMILY))
    tracking = float(b["letterSpacing"] or 0.0) * scale

    measure = ImageDraw.Draw(img)
    max_w = int(W * 0.86)
    lines = _wrap(measure, text, font, max_w, tracking, bool(b["softLineBreak"]))
    line_h = int(size * 1.25)
    block_h = line_h * len(lines)

    cx = W * (float(b["textX"]) / 100.0)
    top = H * (float(b["textY"]) / 100.0) - block_h / 2

    placed = []
    for i, line in enumerate(lines):
        lw = _text_w(measure, line, font, tracking)
        placed.append((line, cx - lw / 2, top + i * line_h))

    # Outline width is authored at the 1024 design width and scales with the
    # canvas, so it stays proportional to the type instead of being a fixed 2px
    # that swallows small text. 0 turns it off — the right choice when the art
    # already has a light text panel behind the words.
    stroke = max(0, round(float(b["outlineWidth"] or 0) * scale))
    halo = _resolve_outline(str(b["outlineColor"] or ""), str(b["fontColor"]))

    # Text and shadow are drawn into SEPARATE transparent layers. Keeping the
    # shadow out of the text layer matters twice over: the panel is measured
    # from the text alone (a shadow folded in would inflate the box around it),
    # and the shadow can carry its own colour instead of the outline's.
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(layer)
    for line, x, y in placed:
        _draw_tracked(
            tdraw, (x, y), line, font, str(b["fontColor"]), tracking,
            stroke_width=stroke, stroke_fill=halo,
        )

    shadow_layer = None
    if b["shadow"]:
        # A drop shadow is dark by definition — it used to borrow the outline
        # colour, so dark text (whose auto halo is white) cast a WHITE shadow
        # that did nothing but swell the panel. It is also no longer tied to
        # the outline: a page with a panel usually wants outline 0 and a shadow.
        shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow_layer)
        offset = max(1, round(size * 0.06))
        for line, x, y in placed:
            _draw_tracked(
                sdraw, (x + offset, y + offset), line, font, (0, 0, 0, 150),
                tracking, stroke_width=stroke, stroke_fill=(0, 0, 0, 150),
            )
        blur = max(2, round(size * 0.05))
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(blur))

    style = str(b["warpStyle"] or STYLE_NONE)
    if style != STYLE_NONE:
        warp_args = dict(
            style=style,
            bend=float(b["warpBend"] or 0),
            distort_h=float(b["warpDistortH"] or 0),
            distort_v=float(b["warpDistortV"] or 0),
            vertical=bool(b["warpVertical"]),
        )
        layer = warp_layer(layer, **warp_args)
        if shadow_layer is not None:
            shadow_layer = warp_layer(shadow_layer, **warp_args)

    out = img.convert("RGBA")
    if b["boxEnabled"]:
        # Measured from the text, NOT the shadow — see above.
        panel = _text_panel(layer, b, scale, W, H)
        if panel is not None:
            out.alpha_composite(panel)
    if shadow_layer is not None:
        out.alpha_composite(shadow_layer)
    out.alpha_composite(layer)
    return out.convert("RGB")


def _text_panel(
    layer: Image.Image, b: dict, scale: float, W: int, H: int
) -> Optional[Image.Image]:
    """A rounded translucent panel sized to the text that will sit on it.

    Measured from the FINISHED text layer, so it accounts for the outline, the
    shadow and any warp — and drawn separately from that layer so the panel
    itself stays a clean rectangle instead of bending with the type.
    """
    bbox = layer.getbbox()
    if not bbox:
        return None
    pad = max(0, round(float(b["boxPadding"] or 0) * scale))
    radius = max(0, round(float(b["boxRadius"] or 0) * scale))
    x0, y0, x1, y1 = bbox
    x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
    if b["boxFullWidth"]:
        margin = int(W * 0.04)
        x0, x1 = margin, W - margin
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    if x1 <= x0 or y1 <= y0:
        return None

    try:
        rgb = ImageColor.getrgb(str(b["boxColor"] or "#FFFFFF"))[:3]
    except Exception:
        rgb = (255, 255, 255)
    alpha = int(max(0, min(100, float(b["boxOpacity"] or 0))) * 255 / 100)
    if alpha <= 0:
        return None

    panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle(
        (x0, y0, x1, y1), radius=radius, fill=(*rgb, alpha)
    )
    return panel


def _resolve_outline(chosen: str, font_color: str) -> tuple[int, int, int]:
    """An explicit halo colour if one was picked, else auto-contrast."""
    if chosen:
        try:
            return ImageColor.getrgb(chosen)[:3]
        except Exception:
            pass
    return outline_color(font_color)


def compose_page(
    *,
    image_src: str,
    child_name: str,
    blocks: Optional[list] = None,
    # --- legacy single-block signature, still used by the render pipeline -----
    story_text: str = "",
    text_x_pct: float = 50,
    text_y_pct: float = 82,
    font_size: int = 42,
    font_color: str = "#FFFFFF",
    font_family: str = DEFAULT_FAMILY,
    letter_spacing: float = 0.0,
    soft_line_break: bool = True,
    outline_width: int = DEFAULT_OUTLINE,
    warp_style: str = STYLE_NONE,
    warp_bend: float = 0.0,
    warp_distort_h: float = 0.0,
    warp_distort_v: float = 0.0,
    warp_vertical: bool = False,
) -> Image.Image:
    """Burn the page's text onto its artwork.

    `blocks` is the general form — a list of independently styled text blocks,
    drawn in order, which is what a cover needs to stack rows in different
    fonts and colours. A page with no blocks falls back to the single-block
    fields, so every existing template keeps rendering unchanged.
    """
    img = _load_image(image_src)

    items = [b for b in (blocks or []) if str((b or {}).get("text", "")).strip()]
    if not items:
        items = [
            {
                "text": story_text,
                "textX": text_x_pct,
                "textY": text_y_pct,
                "fontSize": font_size,
                "fontColor": font_color,
                "fontFamily": font_family,
                "letterSpacing": letter_spacing,
                "softLineBreak": soft_line_break,
                "outlineWidth": outline_width,
                "warpStyle": warp_style,
                "warpBend": warp_bend,
                "warpDistortH": warp_distort_h,
                "warpDistortV": warp_distort_v,
                "warpVertical": warp_vertical,
            }
        ]

    for block in items:
        img = _draw_block(img, block, child_name)
    return img


def compose_to_bytes(fmt: str = "JPEG", quality: int = 92, **kwargs) -> bytes:
    img = compose_page(**kwargs)
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality)
    return buf.getvalue()
