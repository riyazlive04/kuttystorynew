"""Decoupled text layering (Pillow).

Renders the AI image as a clean layer, then burns the personalised story line on
top using the placement stored in PageTemplate (textX/textY as % of canvas,
fontSize, fontColor). Substitutes {{name}} and adds a soft outline + drop-shadow
so text stays legible over any illustration.
"""
from __future__ import annotations

import io
import os
from typing import Optional

import httpx
from PIL import Image, ImageDraw, ImageFont

from .config import settings

# Bundled in the api image via apt (fonts-dejavu-core). Override with FONT_PATH.
FONT_BOLD = os.getenv(
    "FONT_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
)


def personalize(text: str, child_name: str) -> str:
    return (text or "").replace("{{name}}", child_name).replace("{{Name}}", child_name)


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in (FONT_BOLD, "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
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


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
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
) -> Image.Image:
    """Return a PIL image with the personalised story line burned in."""
    img = _load_image(image_src)
    W, H = img.size
    draw = ImageDraw.Draw(img)

    text = personalize(story_text, child_name)
    if not text.strip():
        return img

    # Scale font relative to canvas so % coords behave consistently across sizes.
    size = max(12, int(font_size * (W / 1024)))
    font = _load_font(size)

    max_w = int(W * 0.86)
    lines = _wrap(draw, text, font, max_w)
    line_h = int(size * 1.25)
    block_h = line_h * len(lines)

    cx = W * (text_x_pct / 100.0)
    top = H * (text_y_pct / 100.0) - block_h / 2

    shadow = (0, 0, 0, 180)
    for i, line in enumerate(lines):
        lw = draw.textlength(line, font=font)
        x = cx - lw / 2
        y = top + i * line_h
        # soft outline
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                if dx or dy:
                    draw.text((x + dx, y + dy), line, font=font, fill=shadow)
        # drop shadow
        draw.text((x + 3, y + 4), line, font=font, fill=(0, 0, 0))
        draw.text((x, y), line, font=font, fill=font_color)
    return img


def compose_to_bytes(fmt: str = "JPEG", quality: int = 92, **kwargs) -> bytes:
    img = compose_page(**kwargs)
    buf = io.BytesIO()
    img.save(buf, format=fmt, quality=quality)
    return buf.getvalue()
