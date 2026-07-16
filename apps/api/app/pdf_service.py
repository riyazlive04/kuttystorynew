"""Print fulfillment - stitch all 28 personalized canvases into one
print-ready, high-resolution CMYK PDF (210mm square @ 300dpi).
"""
from __future__ import annotations

import io
import os

import httpx
from PIL import Image, ImageDraw

from .config import settings
from .text_layer import _load_font, personalize

# 210mm square @ 300 dpi
PAGE_PX = 2480


def _placeholder(caption: str, idx: int) -> Image.Image:
    """Render a raster page when no real AI JPEG is available (mock/demo)."""
    palette = [
        (194, 38, 211), (147, 51, 234), (124, 58, 237),
        (99, 102, 241), (14, 165, 233), (16, 185, 129),
    ]
    c = palette[idx % len(palette)]
    img = Image.new("RGB", (PAGE_PX, PAGE_PX), c)
    draw = ImageDraw.Draw(img)
    font = _load_font(90)
    if caption:
        # naive centered wrap
        words, lines, cur = caption.split(), [], ""
        for w in words:
            t = f"{cur} {w}".strip()
            if draw.textlength(t, font=font) <= PAGE_PX * 0.82 or not cur:
                cur = t
            else:
                lines.append(cur); cur = w
        if cur:
            lines.append(cur)
        y = PAGE_PX * 0.78 - len(lines) * 60
        for line in lines:
            lw = draw.textlength(line, font=font)
            x = (PAGE_PX - lw) / 2
            draw.text((x + 3, y + 3), line, font=font, fill=(0, 0, 0))
            draw.text((x, y), line, font=font, fill=(255, 255, 255))
            y += 120
    return img


def _page_image(page: dict, child_name: str, idx: int) -> Image.Image:
    url = (page or {}).get("imageUrl", "")
    caption = (page or {}).get("caption", "")
    try:
        if url.startswith("/uploads/"):
            path = os.path.join(settings.storage_dir, url.split("/uploads/")[1])
            return Image.open(path).convert("RGB").resize((PAGE_PX, PAGE_PX))
        if url.startswith("http"):
            data = httpx.get(url, timeout=60).content
            return Image.open(io.BytesIO(data)).convert("RGB").resize((PAGE_PX, PAGE_PX))
    except Exception:
        pass
    return _placeholder(personalize(caption, child_name), idx)


def build_preview_pdf(job) -> str:
    """Stitch the GENERATED free-preview pages into a lightweight, shareable PDF
    (RGB, 150 dpi) and return its /uploads URL. Only the free pages that have a
    real rendered image are included — locked teaser pages are excluded. Used by
    the "Download preview" action for both the customer and admin.
    """
    from .config import settings as _settings

    free = _settings.free_preview_pages
    pages = list(job.pages) if job.pages else []
    preview = [
        (i, p)
        for i, p in enumerate(pages)
        if i < free and (p or {}).get("imageUrl") and not (p or {}).get("locked")
    ]
    if not preview:
        raise RuntimeError("preview not generated yet")

    imgs = [_page_image(p, job.childName, i).convert("RGB") for i, p in preview]
    os.makedirs(settings.storage_dir, exist_ok=True)
    fname = f"{job.id}_preview.pdf"
    path = os.path.join(settings.storage_dir, fname)
    imgs[0].save(
        path,
        format="PDF",
        save_all=True,
        append_images=imgs[1:],
        resolution=150.0,
        title=f"KuttyStory Preview - {job.storyTitle} for {job.childName}",
    )
    return f"/uploads/{fname}"


def build_book_pdf(job) -> str:
    """Combine all pages into a CMYK print PDF; return its /uploads URL.

    Takes an already-fetched job (the worker owns its own Prisma connection, so
    this stays DB-agnostic).
    """
    pages = list(job.pages) if job.pages else []
    imgs = [
        _page_image(p, job.childName, i).convert("CMYK")
        for i, p in enumerate(pages)
    ]
    if not imgs:
        raise RuntimeError("no pages to render")

    os.makedirs(settings.storage_dir, exist_ok=True)
    fname = f"{job.id}_book.pdf"
    path = os.path.join(settings.storage_dir, fname)
    imgs[0].save(
        path,
        format="PDF",
        save_all=True,
        append_images=imgs[1:],
        resolution=300.0,
        title=f"KuttyStory - {job.storyTitle} for {job.childName}",
    )
    return f"/uploads/{fname}"
