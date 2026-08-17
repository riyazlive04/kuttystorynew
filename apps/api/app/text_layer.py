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


def compose_page(
    *,
    image_src: str,
    story_text: str,
    child_name: str,
    text_x_pct: float,
    text_y_pct: float,
    font_size: int,
    font_color: str = "#FFFFFF",
    font_family: str = DEFAULT_FAMILY,
    letter_spacing: float = 0.0,
    soft_line_break: bool = True,
    outline_width: int = DEFAULT_OUTLINE,
) -> Image.Image:
    """Return a PIL image with the personalised story line burned in."""
    img = _load_image(image_src)
    W, H = img.size
    draw = ImageDraw.Draw(img)

    text = personalize(story_text, child_name)
    if not text.strip():
        return img

    # Scale font relative to canvas so % coords behave consistently across sizes.
    scale = W / 1024
    size = max(12, int(font_size * scale))
    font = _load_font(size, font_family)
    tracking = (letter_spacing or 0.0) * scale

    max_w = int(W * 0.86)
    lines = _wrap(draw, text, font, max_w, tracking, soft_line_break)
    line_h = int(size * 1.25)
    block_h = line_h * len(lines)

    cx = W * (text_x_pct / 100.0)
    top = H * (text_y_pct / 100.0) - block_h / 2

    placed = []
    for i, line in enumerate(lines):
        lw = _text_w(draw, line, font, tracking)
        placed.append((line, cx - lw / 2, top + i * line_h))

    # Outline width is authored at the 1024 design width and scales with the
    # canvas, so it stays proportional to the type instead of being a fixed 2px
    # that swallows small text. 0 turns it off — the right choice when the art
    # already has a light text panel behind the words.
    stroke = max(0, round((outline_width or 0) * scale))

    halo = outline_color(font_color)

    if stroke:
        # A real drop shadow: drawn into an RGBA layer, blurred, then composited.
        # (Passing an RGBA fill straight to an RGB canvas silently discards the
        # alpha, which is what turned this shadow into solid black before.)
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        offset = max(1, round(size * 0.06))
        for line, x, y in placed:
            _draw_tracked(
                sdraw, (x + offset, y + offset), line, font, (*halo, 120), tracking
            )
        shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, stroke)))
        img = Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB")
        draw = ImageDraw.Draw(img)

    for line, x, y in placed:
        _draw_tracked(
            draw, (x, y), line, font, font_color, tracking,
            stroke_width=stroke, stroke_fill=halo,
        )
    return img


def compose_to_bytes(fmt: str = "JPEG", quality: int = 92, **kwargs) -> bytes:
    img = compose_page(**kwargs)
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality)
    return buf.getvalue()
