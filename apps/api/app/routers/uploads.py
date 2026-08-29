"""File uploads - child face photos (rawPhotoUrl) and admin base illustrations.

Saved into the shared storage volume and served back via /uploads/<name>.
"""
import os
import uuid
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from ..config import settings

router = APIRouter(prefix="/upload", tags=["uploads"])

ALLOWED = {"image/jpeg", "image/png", "image/webp"}
# Print-resolution base art is 2480x2480 (210mm @ 300dpi). A detailed
# illustration that size is a few MB as JPEG but routinely 15-25MB as PNG, so
# the old 15MB cap rejected exactly the files we now want people to send.
# The host nginx allows 50M (infra/nginx), so stay under that.
MAX_BYTES = 40 * 1024 * 1024  # 40 MB


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    analyze: bool = Query(
        False,
        description=(
            "Judge the photo's usability as a face source and return the "
            "verdict alongside the URL. The personalize wizard asks for this so "
            "it can tell the parent about a blurry or distant photo while they "
            "still have the phone in hand. Off by default: admin base-art "
            "uploads are illustrations, and running face detection over a "
            "2480px plate on every upload would cost seconds for nothing."
        ),
    ),
):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WEBP images")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large (max {MAX_BYTES // (1024 * 1024)}MB)",
        )

    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[
        file.content_type
    ]
    name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    result = {"url": f"/uploads/{name}", "filename": name}
    if analyze:
        # Never fatal. A photo we could not judge is a photo that uploads
        # normally and gets no caveat -- the upload is the thing the parent
        # asked for, and our opinion of it is a bonus.
        try:
            from ..face_detect import analyse_photo

            result["quality"] = analyse_photo(data)
        except Exception as e:  # noqa: BLE001
            print(f"[upload] photo analysis skipped: {e}", flush=True)
    return result


# --------------------------------------------------------------------------- #
#  Web-sized derivatives                                                       #
# --------------------------------------------------------------------------- #
#
# The base art is print art: 2482px square, CMYK, with a FOGRA39 profile, and
# 11-12MB each. The storefront was serving those to browsers untouched --
# measured, the homepage's hero pulled 55.6MB across six images -- because
# next.config has images.unoptimized and /uploads is a plain StaticFiles mount.
#
# Two problems in one file, and the same conversion fixes both: a browser given
# a CMYK JPEG renders it inconsistently even when it does download all 12MB of
# it.
#
# So `?w=` returns an sRGB, resized, progressive JPEG, written once to
# <storage>/_web/ and served from there afterwards. Without `w` the original is
# served exactly as before, because the PDF builder and the render pipeline read
# these same URLs and need the print original.

WEB_CACHE_DIR = "_web"

# A fixed ladder rather than any integer the query string asks for. An open
# width parameter is a request to fill the disk with 2000 slightly different
# JPEGs of the same picture.
WEB_WIDTHS = (320, 480, 640, 800, 1200, 1600, 2000)

# Uploads are named by uuid and never rewritten, so a derivative of one can be
# cached for as long as the browser likes.
WEB_CACHE_CONTROL = "public, max-age=31536000, immutable"


def _nearest_width(requested: int) -> int:
    return min(WEB_WIDTHS, key=lambda w: abs(w - requested))


def web_variant_path(name: str, width: int) -> str:
    stem = os.path.splitext(name)[0]
    return os.path.join(settings.storage_dir, WEB_CACHE_DIR, f"{stem}_w{width}.jpg")


def serve_upload(name: str, w: Optional[int] = None) -> FileResponse:
    """The original, or a web-sized sRGB derivative of it when `w` is given."""
    # Traversal guard: these names come off the query path, and the directory
    # they index into holds every customer photo on the box.
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=404, detail="Not found")
    original = os.path.join(settings.storage_dir, name)
    if not os.path.isfile(original):
        raise HTTPException(status_code=404, detail="Not found")

    if not w:
        return FileResponse(original, headers={"Cache-Control": WEB_CACHE_CONTROL})

    width = _nearest_width(int(w))
    variant = web_variant_path(name, width)
    if not os.path.isfile(variant):
        try:
            from PIL import Image

            from ..color import open_srgb

            img = open_srgb(original)
            if img.width > width:
                height = max(1, round(img.height * width / img.width))
                img = img.resize((width, height), Image.LANCZOS)
            os.makedirs(os.path.dirname(variant), exist_ok=True)
            # Progressive so the picture appears in passes rather than top-down,
            # and 4:2:0 because at these display sizes the chroma detail is not
            # visible and it is a third of the bytes.
            img.save(variant, format="JPEG", quality=82, optimize=True,
                     progressive=True)
        except Exception as e:  # noqa: BLE001 -- fall back to the original
            print(f"[uploads] derivative failed for {name}: {e}", flush=True)
            return FileResponse(original, headers={"Cache-Control": WEB_CACHE_CONTROL})
    return FileResponse(variant, headers={"Cache-Control": WEB_CACHE_CONTROL})
