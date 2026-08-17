"""Celery tasks - the async personalization pipeline.

Preview flow:  extract identity ONCE -> render the front cover + pages 1..FREE
               (13) -> completed.
Purchase flow: render locked pages 14..28 + the back cover -> stitch the
               print-ready PDF.

Covers are ordinary page templates at reserved numbers (see pages_layout), so a
book's page list is [front cover] + 1..TOTAL + [back cover] and a slot index is
NOT a page number.

Progress is written to Postgres after every page so the frontend can long-poll
or read the WebSocket stream.
"""
import asyncio
import contextlib
import glob
import os
from datetime import datetime, timedelta, timezone

from prisma import Prisma, Json

from .config import settings
from .generation_engine import extract_identity, render_page
from .pages_layout import (
    FRONT_COVER,
    is_free,
    kind_of,
    normalize_variant,
    other_variant,
    reading_order,
    render_seed,
)
from .text_layer import personalize
from .worker import celery_app

FREE = settings.free_preview_pages
TOTAL = settings.total_pages

# Prisma's disconnect() defaults to timeout=None. On Linux that sends SIGINT to
# the query engine and then waits with no deadline — the SIGKILL escalation only
# fires on TimeoutExpired, which can never happen without a timeout. An engine
# that ignores SIGINT therefore blocks the task forever, holding its Celery pool
# slot long after the job row says "completed". Always pass a timeout.
_DISCONNECT_TIMEOUT = timedelta(seconds=5)


async def _disconnect(db: Prisma) -> None:
    """Tear down a task's Prisma client without ever wedging the pool slot."""
    with contextlib.suppress(Exception):
        await db.disconnect(timeout=_DISCONNECT_TIMEOUT)


_DEFAULT_CAPTIONS = [
    "Once upon a time there was a wonderful child named {{name}}.",
    "{{name}} woke up ready for an amazing adventure.",
    '"Today," said {{name}}, "anything is possible!"',
    "Along the way, {{name}} made a brand new friend.",
    "Together they discovered a secret hidden in plain sight.",
    "{{name}} was brave, even when things felt a little scary.",
    "With a big smile, {{name}} solved the puzzle.",
    "Everyone cheered for {{name}}!",
]


async def _templates(db: Prisma, story_id: str, gender: str = "") -> dict[int, object]:
    """The book's pages for this child's gender.

    Falls back to the other variant when the requested one hasn't been authored,
    so a book that only has "boy" art still renders for every child instead of
    producing an empty book.
    """
    variant = normalize_variant(gender)
    rows = await db.pagetemplate.find_many(
        where={"bookTemplateId": story_id, "variant": variant}
    )
    if not rows:
        rows = await db.pagetemplate.find_many(
            where={"bookTemplateId": story_id, "variant": other_variant(variant)}
        )
    return {r.pageNumber: r for r in rows}


def _base_art(gallery: list, page_number: int) -> str:
    """Fallback illustration when a page has no authored base art. Indexed on
    abs() so the reserved cover numbers (0, -1) don't wrap to the tail."""
    if not gallery:
        return ""
    return gallery[abs(page_number) % len(gallery)]


def _blank(page_number: int, index: int, locked: bool, teaser: str = "") -> dict:
    return {
        "index": index,
        "pageNumber": page_number,
        "kind": kind_of(page_number),
        "imageUrl": teaser,
        "caption": "",
        "locked": locked,
    }


def _relayout(stored: list, order: list[int]) -> list[dict]:
    """Re-seat an existing job's pages onto the book's reading order.

    Keeps already-rendered pages by their page number, so a job created before
    its book had covers (entries carry no pageNumber — fall back to position)
    picks up the cover slots without losing a single render.
    """
    by_number: dict[int, dict] = {}
    for i, p in enumerate(stored or []):
        if not isinstance(p, dict):
            continue
        by_number[p.get("pageNumber", i + 1)] = p
    out = []
    for index, n in enumerate(order):
        prev = by_number.get(n)
        if prev is None:
            out.append(_blank(n, index, locked=not is_free(n, FREE)))
        else:
            out.append({**prev, "index": index, "pageNumber": n, "kind": kind_of(n)})
    return out


async def _render_one(
    job, template, page_number: int, base_image: str, seed: int | None = None
) -> dict:
    """Render a single page: AI image (identity-consistent) + burned text."""
    scene = (
        template.scenePrompt
        if template
        else f"children's storybook illustration, whimsical, page {page_number}"
    )
    story_text = (
        template.storyText
        if template
        else _DEFAULT_CAPTIONS[(page_number - 1) % len(_DEFAULT_CAPTIONS)]
    )

    # Diffrun-style: inpaint the child's face into the pre-drawn illustration.
    base_image_url = getattr(template, "baseImageUrl", None) if template else None
    style_prompt = getattr(template, "stylePrompt", None) if template else None
    # Freeform polygon mask takes priority over the box; either constrains the
    # swap to the face so the template's hair is kept. Skipped entirely when the
    # admin has turned the face-outline feature OFF in Settings (full-head swap).
    from .app_settings import face_outline_enabled

    face_region = None
    if face_outline_enabled():
        face_path = getattr(template, "facePath", None) if template else None
        if face_path and len(face_path) >= 3:
            face_region = {"points": face_path}
        elif template and template.faceX is not None and template.faceW is not None:
            face_region = {
                "x": template.faceX,
                "y": template.faceY,
                "w": template.faceW,
                "h": template.faceH,
            }

    image_url = await render_page(
        scene_prompt=scene,
        identity_vectors=job.identityVectors,
        face_image_name=job.photoUrl,
        base_image=base_image,
        base_image_url=base_image_url,
        style_prompt=style_prompt,
        face_region=face_region,
        seed=render_seed(page_number) if seed is None else seed,
    )

    # Real raster output -> burn text with PIL and persist a composed JPEG.
    # (http = hosted model output; /uploads = a swapped page saved locally.)
    # Skip when there's no story text (e.g. templates that already have the text
    # baked in) — otherwise we'd double up the text on the page.
    if (
        (image_url.startswith("http") or image_url.startswith("/uploads/"))
        and template is not None
        and (story_text or "").strip()
    ):
        from .text_layer import compose_to_bytes

        try:
            data = compose_to_bytes(
                image_src=image_url,
                story_text=story_text,
                child_name=job.childName,
                text_x_pct=template.textX,
                text_y_pct=template.textY,
                font_size=template.fontSize,
                font_color=template.fontColor,
                font_family=getattr(template, "fontFamily", None) or "sans",
                letter_spacing=getattr(template, "letterSpacing", 0) or 0,
                soft_line_break=getattr(template, "softLineBreak", True),
                outline_width=getattr(template, "outlineWidth", None) or 0,
            )
            os.makedirs(settings.storage_dir, exist_ok=True)
            fname = f"{job.id}_p{page_number}.jpg"
            with open(os.path.join(settings.storage_dir, fname), "wb") as f:
                f.write(data)
            image_url = f"/uploads/{fname}"
        except Exception:
            pass  # fall back to the raw AI image if compositing fails

    # `index` is the slot in the book's reading order — the caller owns it,
    # since covers shift every story page along.
    return {
        "index": page_number - 1,
        "pageNumber": page_number,
        "kind": kind_of(page_number),
        "imageUrl": image_url,
        "caption": personalize(story_text, job.childName),
        "locked": not is_free(page_number, FREE),
    }


async def _run_preview(job_id: str) -> None:
    db = Prisma()
    await db.connect()
    try:
        job = await db.job.find_unique(where={"id": job_id})
        if not job:
            return
        story = await db.story.find_unique(where={"slug": job.storySlug})
        gallery = (story.gallery if story else []) or []
        templates = await _templates(db, story.id, job.gender) if story else {}

        await db.job.update(
            where={"id": job_id}, data={"status": "processing", "progress": 5}
        )

        # 1) Extract the child's face embedding ONCE (the key cost optimisation).
        identity = job.identityVectors
        if identity is None:
            identity = await extract_identity(job.photoUrl or "")
            await db.job.update(
                where={"id": job_id},
                data={"identityVectors": Json(identity), "progress": 10},
            )
            job = await db.job.find_unique(where={"id": job_id})

        # 2) Render free preview pages 1..FREE concurrently (bounded), mark the
        # rest locked. Concurrency keeps wall-clock low for a full preview; the
        # semaphore caps parallel hosted calls so we don't trip rate limits.
        # Locked pages get a BLURRED TEASER = the authored base illustration
        # (generic child, unpersonalized). It costs nothing extra (the art already
        # exists) and lets the storefront show the whole book blurred to drive
        # conversion, instead of a hard wall. Free pages start empty (shimmer).
        def _teaser(n: int) -> str:
            t = templates.get(n)
            return (getattr(t, "baseImageUrl", "") or "") if t else ""

        # Reading order — the authored covers bracket the story pages, so a slot
        # is no longer the same thing as a page number.
        order = reading_order(templates.keys(), TOTAL)
        slot = {n: i for i, n in enumerate(order)}
        free_numbers = [n for n in order if is_free(n, FREE)]

        pages: list[dict] = [
            _blank(
                n,
                i,
                locked=not is_free(n, FREE),
                teaser="" if is_free(n, FREE) else _teaser(n),
            )
            for i, n in enumerate(order)
        ]
        await db.job.update(
            where={"id": job_id},
            data={"status": "rendering", "progress": 12, "pages": Json(pages)},
        )

        sem = asyncio.Semaphore(settings.render_concurrency)
        done = 0
        lock = asyncio.Lock()

        async def _one(n: int) -> None:
            nonlocal done
            base = _base_art(gallery, n)
            async with sem:
                page = await _render_one(job, templates.get(n), n, base)
            async with lock:
                nonlocal pages
                pages[slot[n]] = {**page, "index": slot[n]}
                done += 1
                progress = 12 + int(done / max(1, len(free_numbers)) * 86)
                await db.job.update(
                    where={"id": job_id},
                    data={"progress": progress, "pages": Json(pages)},
                )

        await asyncio.gather(*(_one(n) for n in free_numbers))

        await db.job.update(
            where={"id": job_id},
            data={"status": "completed", "progress": 100, "pages": Json(pages)},
        )
    except Exception:
        await db.job.update(where={"id": job_id}, data={"status": "failed"})
        raise
    finally:
        await _disconnect(db)


async def _run_remaining(job_id: str) -> None:
    """Render everything still locked after purchase, then build the PDF.

    That's story pages FREE+1..TOTAL, the back cover, and any free slot whose
    render never landed (including a cover authored after the preview ran).
    """
    db = Prisma()
    await db.connect()
    try:
        job = await db.job.find_unique(where={"id": job_id})
        if not job:
            return
        story = await db.story.find_unique(where={"slug": job.storySlug})
        gallery = (story.gallery if story else []) or []
        templates = await _templates(db, story.id, job.gender) if story else {}

        # Re-seat onto the current reading order: a job queued before its book
        # got covers still gets them rendered here, keeping its free pages.
        order = reading_order(templates.keys(), TOTAL)
        slot = {n: i for i, n in enumerate(order)}
        pages = _relayout(job.pages, order)
        # Everything still behind the paywall, plus any slot with nothing in it —
        # that's how a cover authored after the preview ran still gets rendered.
        locked_numbers = [
            n
            for n in order
            if not is_free(n, FREE) or not pages[slot[n]].get("imageUrl")
        ]

        sem = asyncio.Semaphore(settings.render_concurrency)
        lock = asyncio.Lock()

        async def _one(n: int) -> None:
            base = _base_art(gallery, n)
            async with sem:
                page = await _render_one(job, templates.get(n), n, base)
            page["locked"] = False
            async with lock:
                pages[slot[n]] = {**page, "index": slot[n]}
                await db.job.update(where={"id": job_id}, data={"pages": Json(pages)})

        await asyncio.gather(*(_one(n) for n in locked_numbers))

        # Purchased books are preserved for 30 days (Diffrun-style), not the 48h
        # preview window — so the customer can re-download / re-print.
        from datetime import timedelta

        preserved_until = datetime.now(timezone.utc) + timedelta(
            days=settings.preserved_retention_days
        )
        job = await db.job.update(
            where={"id": job_id},
            data={
                "pages": Json(pages),
                "isPurchased": True,
                "preservedUntil": preserved_until,
            },
        )

        # Stitch the print-ready PDF from the freshly-updated job.
        from .pdf_service import build_book_pdf

        pdf_url = build_book_pdf(job)
        await db.job.update(where={"id": job_id}, data={"pdfDownloadUrl": pdf_url})
    finally:
        await _disconnect(db)


@celery_app.task(name="app.tasks.generate_book", bind=True, max_retries=2)
def generate_book(self, job_id: str) -> str:
    try:
        asyncio.run(_run_preview(job_id))
    except Exception as exc:  # pragma: no cover
        raise self.retry(exc=exc, countdown=5)
    return job_id


async def _run_full(job_id: str) -> None:
    """Admin proof render: every page of the book, nothing paywalled.

    Same pipeline as a customer run — the point is to check exactly what a buyer
    would get — but it renders the whole reading order in one pass instead of
    stopping at the free preview, and finishes by stitching the CMYK print PDF
    so the print output can be checked too.
    """
    db = Prisma()
    await db.connect()
    try:
        job = await db.job.find_unique(where={"id": job_id})
        if not job:
            return
        story = await db.story.find_unique(where={"slug": job.storySlug})
        gallery = (story.gallery if story else []) or []
        templates = await _templates(db, story.id, job.gender) if story else {}

        await db.job.update(
            where={"id": job_id}, data={"status": "processing", "progress": 5}
        )

        identity = job.identityVectors
        if identity is None:
            identity = await extract_identity(job.photoUrl or "")
            await db.job.update(
                where={"id": job_id},
                data={"identityVectors": Json(identity), "progress": 10},
            )
            job = await db.job.find_unique(where={"id": job_id})

        order = reading_order(templates.keys(), TOTAL)
        slot = {n: i for i, n in enumerate(order)}
        pages = [_blank(n, i, locked=False) for i, n in enumerate(order)]
        await db.job.update(
            where={"id": job_id},
            data={"status": "rendering", "progress": 12, "pages": Json(pages)},
        )

        sem = asyncio.Semaphore(settings.render_concurrency)
        done = 0
        lock = asyncio.Lock()

        async def _one(n: int) -> None:
            nonlocal done, pages
            async with sem:
                page = await _render_one(job, templates.get(n), n, _base_art(gallery, n))
            async with lock:
                # Nothing is locked in a proof render — the whole point is to see
                # every page, including the ones a customer would have to buy.
                pages[slot[n]] = {**page, "index": slot[n], "locked": False}
                done += 1
                await db.job.update(
                    where={"id": job_id},
                    data={
                        "progress": 12 + int(done / max(1, len(order)) * 84),
                        "pages": Json(pages),
                    },
                )

        await asyncio.gather(*(_one(n) for n in order))

        job = await db.job.update(
            where={"id": job_id},
            data={"status": "completed", "progress": 100, "pages": Json(pages)},
        )
        try:
            from .pdf_service import build_book_pdf

            pdf_url = build_book_pdf(job)
            await db.job.update(
                where={"id": job_id}, data={"pdfDownloadUrl": pdf_url}
            )
        except Exception:
            pass  # the pages are the deliverable here; the PDF is a bonus
    except Exception:
        await db.job.update(where={"id": job_id}, data={"status": "failed"})
        raise
    finally:
        await _disconnect(db)


@celery_app.task(name="app.tasks.generate_full_book", bind=True, max_retries=1)
def generate_full_book(self, job_id: str) -> str:
    try:
        asyncio.run(_run_full(job_id))
    except Exception as exc:  # pragma: no cover
        raise self.retry(exc=exc, countdown=5)
    return job_id


@celery_app.task(name="app.tasks.render_remaining", bind=True, max_retries=2)
def render_remaining(self, job_id: str) -> str:
    try:
        asyncio.run(_run_remaining(job_id))
    except Exception as exc:  # pragma: no cover
        raise self.retry(exc=exc, countdown=5)
    return job_id


# --------------------------------------------------------------------------- #
#  Refine: regenerate a single page's face (Diffrun "fine-tune face" step)     #
# --------------------------------------------------------------------------- #

async def _regenerate_page(job_id: str, page_number: int) -> None:
    import random

    db = Prisma()
    await db.connect()
    try:
        job = await db.job.find_unique(where={"id": job_id})
        if not job:
            return
        story = await db.story.find_unique(where={"slug": job.storySlug})
        templates = await _templates(db, story.id, job.gender) if story else {}
        gallery = (story.gallery if story else []) or []
        base = _base_art(gallery, page_number)

        order = reading_order(templates.keys(), TOTAL)
        if page_number not in order:
            return  # asked to refine a page this book doesn't have

        # Fresh seed so the re-roll differs from the previous render.
        page = await _render_one(
            job, templates.get(page_number), page_number, base,
            seed=random.randint(1, 10_000_000),
        )
        pages = _relayout(job.pages, order)
        index = order.index(page_number)
        # Preserve the page's locked state (free pages stay unlocked).
        page["locked"] = not is_free(page_number, FREE) and not job.isPurchased
        pages[index] = {**page, "index": index}
        await db.job.update(where={"id": job_id}, data={"pages": Json(pages)})
    finally:
        await _disconnect(db)


@celery_app.task(name="app.tasks.regenerate_page", bind=True, max_retries=2)
def regenerate_page(self, job_id: str, page_number: int) -> str:
    try:
        asyncio.run(_regenerate_page(job_id, page_number))
    except Exception as exc:  # pragma: no cover
        raise self.retry(exc=exc, countdown=5)
    return job_id


# --------------------------------------------------------------------------- #
#  Admin: generate the FIXED base illustrations for a whole book (once)        #
# --------------------------------------------------------------------------- #

async def _generate_book_base_art(
    story_id: str, overwrite: bool, variant: str = ""
) -> dict:
    """Generate a generic-child base illustration for every page of one gender
    variant of a book, so the fixed-template + face-personalization pipeline has
    consistent art per page."""
    import os

    from .generation_engine import generate_base_art

    variant = normalize_variant(variant)
    db = Prisma()
    await db.connect()
    made, skipped, failed = 0, 0, 0
    try:
        pages = await db.pagetemplate.find_many(
            where={"bookTemplateId": story_id, "variant": variant},
            order={"pageNumber": "asc"},
        )
        story = await db.story.find_unique(where={"id": story_id})
        # Only the shop-facing variant's front cover becomes the catalog image.
        primary = normalize_variant(getattr(story, "genderLock", None) or "")
        sem = asyncio.Semaphore(settings.render_concurrency)

        async def _one(p):
            nonlocal made, skipped, failed
            if p.baseImageUrl and not overwrite:
                skipped += 1
                return
            child = "a single generic %s character, no text" % (
                "boy" if variant == "boy" else "girl"
            )
            prompt = ", ".join(x for x in [p.scenePrompt, p.stylePrompt, child] if x)
            try:
                async with sem:
                    data = await generate_base_art(
                        scene_prompt=prompt, seed=render_seed(p.pageNumber)
                    )
                os.makedirs(settings.storage_dir, exist_ok=True)
                name = f"base_{story_id}_{variant}_p{p.pageNumber}.jpg"
                with open(os.path.join(settings.storage_dir, name), "wb") as f:
                    f.write(data)
                url = f"/uploads/{name}"
                await db.pagetemplate.update(
                    where={"id": p.id}, data={"baseImageUrl": url}
                )
                # The front cover's art doubles as the book's shop image.
                if p.pageNumber == FRONT_COVER and variant == primary:
                    await db.story.update(
                        where={"id": story_id}, data={"coverImage": url}
                    )
                made += 1
            except Exception:
                failed += 1

        await asyncio.gather(*(_one(p) for p in pages))
    finally:
        await _disconnect(db)
    return {"made": made, "skipped": skipped, "failed": failed}


@celery_app.task(name="app.tasks.generate_book_base_art", bind=True)
def generate_book_base_art(
    self, story_id: str, overwrite: bool = False, variant: str = ""
) -> dict:
    return asyncio.run(_generate_book_base_art(story_id, overwrite, variant))


# --------------------------------------------------------------------------- #
#  48-hour data purge (runs hourly via Celery beat)                            #
# --------------------------------------------------------------------------- #

async def _purge() -> int:
    db = Prisma()
    await db.connect()
    purged = 0
    try:
        now = datetime.now(timezone.utc)
        # Non-purchased previews: purge 48h after expiresAt.
        # Purchased/preserved books: purge only after preservedUntil (30 days).
        expired = await db.job.find_many(
            where={
                "purged": False,
                "OR": [
                    {"isPurchased": False, "expiresAt": {"lt": now}},
                    {"isPurchased": True, "preservedUntil": {"lt": now}},
                ],
            }
        )
        for job in expired:
            # Delete the raw uploaded face photo.
            if job.photoUrl and "/uploads/" in job.photoUrl:
                _safe_unlink(os.path.join(settings.storage_dir, job.photoUrl.split("/uploads/")[1]))
            # Delete cached preview page assets for this session.
            for f in glob.glob(os.path.join(settings.storage_dir, f"{job.id}_*")):
                _safe_unlink(f)
            # Scrub PII from the row and mark purged.
            await db.job.update(
                where={"id": job.id},
                data={
                    "purged": True,
                    "photoUrl": None,
                    "identityVectors": Json(None),
                    "pages": Json([]),
                },
            )
            purged += 1
    finally:
        await _disconnect(db)
    return purged


def _safe_unlink(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


@celery_app.task(name="app.tasks.purge_expired")
def purge_expired() -> int:
    """Permanently delete raw photos + preview assets for non-purchased sessions
    that expired more than the retention window ago. Returns count purged."""
    return asyncio.run(_purge())
