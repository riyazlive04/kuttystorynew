"""File uploads - child face photos (rawPhotoUrl) and admin base illustrations.

Saved into the shared storage volume and served back via /uploads/<name>.
"""
import os
import uuid

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

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
