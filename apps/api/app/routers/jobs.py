import asyncio
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from prisma import Json

from ..config import settings
from ..db import prisma
from ..comfyui import build_pages
from ..schemas import PersonalizationIn
from ..serializers import job_dict

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("")
async def create_job(payload: PersonalizationIn):
    story = await prisma.story.find_unique(where={"slug": payload.storySlug})
    if not story:
        raise HTTPException(status_code=404, detail="Unknown story")

    # Initial placeholder pages so the preview shows even before the worker runs
    # (the Celery worker overwrites these with identity-consistent renders).
    pages = build_pages(
        child_name=payload.childName,
        total=story.pages,
        cover=story.coverImage,
        gallery=story.gallery,
    )
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=settings.data_retention_hours
    )

    # Diffrun-style: accept a few photos; the first is the primary face and the
    # rest strengthen identity. Fall back to the single photoUrl for compat.
    photo_urls = payload.photoUrls or ([payload.photoUrl] if payload.photoUrl else [])
    primary_photo = payload.photoUrl or (photo_urls[0] if photo_urls else None)

    job = await prisma.job.create(
        data={
            "storySlug": story.slug,
            "storyTitle": story.title,
            "childName": payload.childName,
            "gender": payload.gender,
            "ageYears": payload.ageYears,
            "language": payload.language,
            "skinTone": payload.skinTone,
            "dedication": payload.dedication,
            "photoUrl": primary_photo,
            "photoUrls": photo_urls,
            "status": "queued",
            "progress": 0,
            "pages": Json(pages),
            "expiresAt": expires_at,
        }
    )

    # Kick off the async render pipeline (Celery). Import lazily so the API can
    # boot even if the broker isn't reachable at import time.
    try:
        from ..tasks import generate_book

        generate_book.delay(job.id)
    except Exception:
        # No broker available (pure API demo). The time-based mock in
        # serializers.job_dict still advances the preview to completion.
        pass

    return job_dict(job)


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_dict(job)


@router.get("/{job_id}/preview.pdf")
async def download_preview(job_id: str):
    """Download the generated free-preview pages as a PDF (customer + admin).
    Public like GET /jobs/{id}; only the free pages are ever included."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from ..pdf_service import build_preview_pdf

    try:
        # PDF stitching is CPU/IO-bound — run off the event loop.
        url = await asyncio.to_thread(build_preview_pdf, job)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Preview not ready: {e}")
    path = os.path.join(settings.storage_dir, url.split("/uploads/", 1)[1])
    safe_name = "".join(
        c for c in (job.childName or "story") if c.isalnum() or c in " -_"
    ).strip() or "story"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"KuttyStory-preview-{safe_name}.pdf",
    )


@router.get("/{job_id}/book.pdf")
async def download_book(job_id: str):
    """Download the full personalized book as a PDF (after purchase). Stitches all
    pages currently in the job; unrendered pages fall back to their base art."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from ..pdf_service import build_book_pdf

    try:
        url = await asyncio.to_thread(build_book_pdf, job)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Book not ready: {e}")
    path = os.path.join(settings.storage_dir, url.split("/uploads/", 1)[1])
    safe_name = "".join(
        c for c in (job.childName or "story") if c.isalnum() or c in " -_"
    ).strip() or "story"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"KuttyStory-{safe_name}.pdf",
    )


@router.post("/{job_id}/pages/{page_number}/regenerate")
async def regenerate_page(job_id: str, page_number: int):
    """Diffrun 'fine-tune face' step: re-roll one page's face with a fresh seed.
    Free pages any time; locked pages only after purchase."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if page_number > settings.free_preview_pages and not job.isPurchased:
        raise HTTPException(status_code=403, detail="Purchase to refine locked pages")
    await prisma.job.update(
        where={"id": job_id}, data={"status": "rendering"}
    )
    try:
        from ..tasks import regenerate_page as regen_task

        regen_task.delay(job_id, page_number)
    except Exception:
        raise HTTPException(status_code=503, detail="Render queue unavailable")
    return {"ok": True, "pageNumber": page_number}


@router.post("/{job_id}/approve")
async def approve_for_print(job_id: str):
    """Diffrun 'approve for print' gate — required before production/shipping."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.isPurchased:
        raise HTTPException(status_code=403, detail="Purchase before approving")
    job = await prisma.job.update(
        where={"id": job_id},
        data={"printApproved": True, "approvedAt": datetime.now(timezone.utc)},
    )
    return {"ok": True, "printApproved": True}
