"""File uploads - child face photos (rawPhotoUrl) and admin base illustrations.

Saved into the shared storage volume and served back via /uploads/<name>.
"""
import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import settings

router = APIRouter(prefix="/upload", tags=["uploads"])

ALLOWED = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("")
async def upload_file(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WEBP images")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 15MB)")

    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[
        file.content_type
    ]
    name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{name}", "filename": name}
