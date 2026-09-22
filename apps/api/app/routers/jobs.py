import asyncio
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from prisma import Json

from ..config import settings
from ..db import prisma
from ..comfyui import build_pages
from ..pages_layout import COVER_NUMBERS, is_free, label_of, normalize_variant
from ..schemas import PersonalizationIn
from ..serializers import job_dict

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("")
async def create_job(payload: PersonalizationIn):
    story = await prisma.story.find_unique(where={"slug": payload.storySlug})
    if not story:
        raise HTTPException(status_code=404, detail="Unknown story")

    # A gender-locked book only has artwork for that gender — reject the other
    # one here too, so the rule doesn't depend on the storefront honouring it.
    lock = getattr(story, "genderLock", None)
    if lock and payload.gender in ("boy", "girl") and payload.gender != lock:
        raise HTTPException(
            status_code=400,
            detail=f"“{story.title}” is only available as a {lock}'s book.",
        )

    # Initial placeholder pages so the preview shows even before the worker runs
    # (the Celery worker overwrites these with identity-consistent renders).
    # Include the authored covers so the page list has its final shape from the
    # start and the flip-book doesn't reflow when the first render lands.
    cover_rows = await prisma.pagetemplate.find_many(
        where={
            "bookTemplateId": story.id,
            "variant": normalize_variant(payload.gender),
            "pageNumber": {"in": list(COVER_NUMBERS)},
        }
    )
    pages = build_pages(
        child_name=payload.childName,
        total=story.pages,
        cover=story.coverImage,
        gallery=story.gallery,
        cover_art={r.pageNumber: (r.baseImageUrl or "") for r in cover_rows},
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


@router.post("/{job_id}/retry")
async def retry_preview(job_id: str):
    """Try a failed preview again — the customer's "Try again" button.

    Resumes: pages that already rendered are kept and only the missing ones are
    redone, so a retry is quick and costs only what failed. Refused while a run
    is still going, so a double-click can't start two paid renders.
    """
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != "failed":
        raise HTTPException(status_code=409, detail="This preview is not failed")
    job = await prisma.job.update(
        where={"id": job_id},
        data={"status": "queued", "error": None},
    )
    try:
        from ..tasks import generate_book

        generate_book.delay(job.id)
    except Exception:
        # Put it back: "queued" with nothing queued is a new way to be stuck.
        await prisma.job.update(
            where={"id": job_id},
            data={"status": "failed", "error": "Render queue unavailable"},
        )
        raise HTTPException(status_code=503, detail="Render queue unavailable")
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


@router.get("/{job_id}/print.pdf")
async def download_print(job_id: str):
    """The CMYK press file for the printer. book.pdf is the RGB copy the
    customer downloads; this one only looks right in prepress software."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    from ..pdf_service import build_print_pdf

    try:
        url = await asyncio.to_thread(build_print_pdf, job)
    except Exception as e:
        raise HTTPException(status_code=409, detail=f"Book not ready: {e}")
    path = os.path.join(settings.storage_dir, url.split("/uploads/", 1)[1])
    safe_name = "".join(
        c for c in (job.childName or "story") if c.isalnum() or c in " -_"
    ).strip() or "story"
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"KuttyStory-print-{safe_name}.pdf",
    )


@router.post("/{job_id}/pages/{page_number}/regenerate")
async def regenerate_page(job_id: str, page_number: int):
    """Diffrun 'fine-tune face' step: re-roll one page's face with a fresh seed.
    Free pages any time; locked pages only after purchase."""
    job = await prisma.job.find_unique(where={"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # The back cover is locked like any post-paywall page, even though its
    # reserved number (-1) sorts below the free-page threshold.
    if not is_free(page_number, settings.free_preview_pages) and not job.isPurchased:
        raise HTTPException(
            status_code=403,
            detail=f"Purchase to refine {label_of(page_number).lower()}",
        )
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
