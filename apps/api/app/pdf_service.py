"""Print fulfillment - stitch all 28 personalized canvases into one
print-ready, high-resolution CMYK PDF (210mm square @ 300dpi).
"""
from __future__ import annotations

import io
import os

import httpx
from PIL import Image, ImageDraw, ImageFilter

from .color import open_srgb, to_cmyk
from .config import settings
from .text_layer import _load_font, personalize

# 210mm square @ 300 dpi
PAGE_PX = 2480

# 210mm square @ 150 dpi, for the shareable preview.
#
# The preview used to be built on the PRINT canvas and then declared 150 dpi,
# which makes a 420mm page -- twice the book it is previewing -- and carries four
# times the pixels anyone can see at that resolution. Every page was upscaled
# from the render's own ~1200px to 2480px, sharpened, and JPEG'd at quality 95,
# so a five-page preview ran about 10MB for no visible gain over 2.5MB.
PREVIEW_PX = 1240

# Pillow embeds PDF images as JPEG at quality 75 unless told otherwise, which
# visibly softens artwork that has ALREADY been through a JPEG on the way in.
# 4:4:4 (subsampling=0) matters as much as the quality here: the default 4:2:0
# halves the colour resolution, and coloured text on illustration is exactly
# where that shows.
PDF_JPEG = {"quality": 95, "subsampling": 0}


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


def _fit_square(img: Image.Image, edge: int = PAGE_PX) -> Image.Image:
    """Scale onto a square canvas of `edge` px WITHOUT distorting.

    A straight resize((edge, edge)) squashes any non-square page — which shows up
    as compressed, stretched-looking text. Scale to fit and letterbox onto white
    instead, so the burned-in type keeps its proportions.
    """
    img = img.convert("RGB")
    if img.size == (edge, edge):
        return img
    w, h = img.size
    scale = min(edge / w, edge / h)
    fitted = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    # Enlarging cannot add detail, but it does soften every edge — a light
    # unsharp mask restores the bite that makes a print look crisp. Only on the
    # way up; downscaling is already sharp.
    if scale > 1.05:
        fitted = fitted.filter(
            ImageFilter.UnsharpMask(radius=1.6, percent=110, threshold=3)
        )
    canvas = Image.new("RGB", (edge, edge), (255, 255, 255))
    canvas.paste(fitted, ((edge - fitted.width) // 2, (edge - fitted.height) // 2))
    return canvas


def _page_image(
    page: dict, child_name: str, idx: int, edge: int = PAGE_PX
) -> Image.Image:
    url = (page or {}).get("imageUrl", "")
    caption = (page or {}).get("caption", "")
    try:
        if url.startswith("/uploads/"):
            path = os.path.join(settings.storage_dir, url.split("/uploads/")[1])
            return _fit_square(open_srgb(path), edge)
        if url.startswith("http"):
            data = httpx.get(url, timeout=60).content
            return _fit_square(open_srgb(data), edge)
    except Exception:
        pass
    return _fit_square(_placeholder(personalize(caption, child_name), idx), edge)


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

    imgs = [
        _page_image(p, job.childName, i, PREVIEW_PX).convert("RGB")
        for i, p in preview
    ]
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
        **PDF_JPEG,
    )
    return f"/uploads/{fname}"


def build_book_pdf(job) -> str:
    """Combine all pages into a CMYK print PDF; return its /uploads URL.

    Pages are composed in sRGB (that's what the models return and what the web
    preview needs); the conversion to CMYK happens here, once, through an ICC
    profile when one is installed — see app.color for why `convert("CMYK")`
    alone is not good enough for print.

    Takes an already-fetched job (the worker owns its own Prisma connection, so
    this stays DB-agnostic).
    """
    pages = list(job.pages) if job.pages else []
    imgs = [
        to_cmyk(_page_image(p, job.childName, i))
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
        **PDF_JPEG,
    )
    return f"/uploads/{fname}"
