"""Convert Prisma models into the JSON shapes the Next.js frontend expects."""
from datetime import datetime, timezone

from .config import settings
from .pages_layout import primary_variant

# How many interior pages of a book the storefront may show off. Two is enough
# for the homepage slideshow without turning the catalogue response into a list
# of every page in every book.
SAMPLE_PAGE_LIMIT = 2


def sample_pages(s) -> list[str]:
    """The book's own interior artwork, for the storefront to show off.

    Only meaningful when the caller loaded `pageTemplates`; otherwise empty.
    Covers and the spine are excluded — the front cover is already mirrored onto
    coverImage, and the spine is print-only.
    """
    templates = getattr(s, "pageTemplates", None) or []
    variant = primary_variant(getattr(s, "genderLock", None))
    interior = [
        p
        for p in templates
        if p.pageNumber >= 1
        and getattr(p, "variant", "boy") == variant
        and p.baseImageUrl
    ]
    interior.sort(key=lambda p: p.pageNumber)
    return [p.baseImageUrl for p in interior[:SAMPLE_PAGE_LIMIT]]


def story_dict(s) -> dict:
    return {
        "id": s.id,
        "slug": s.slug,
        "title": s.title,
        "tagline": s.tagline,
        "description": s.description,
        "categoryTag": s.categoryTag,
        "ageRange": s.ageRange,
        "minAge": s.minAge,
        "maxAge": s.maxAge,
        "pdfPrice": s.pdfPrice,
        "printPrice": s.printPrice,
        "bilingualAddon": s.bilingualAddon,
        "pages": s.pages,
        "coverImage": s.coverImage,
        # The girl variant's front-cover art, when the book is authored for both
        # genders. None = show coverImage to everyone.
        "coverImageGirl": getattr(s, "coverImageGirl", None),
        "gallery": s.gallery,
        # Interior page art, when the caller loaded the page templates. Lets the
        # storefront show real pages from whichever books are live instead of a
        # hand-maintained list that goes stale the moment a book is unpublished.
        "samplePages": sample_pages(s),
        "themeColor": s.themeColor,
        "supportsTamil": s.supportsTamil,
        "highlights": s.highlights,
        # None = the book works for any child; "boy"/"girl" restricts it.
        "genderLock": getattr(s, "genderLock", None),
        "spineImage": getattr(s, "spineImage", None),
    }


def derive_progress(created_at: datetime, status: str) -> tuple[str, int]:
    """Time-based progress for the mock renderer.

    Lets GET /jobs advance a preview even when no Celery worker is running.
    When a real GPU pipeline is active the worker writes authoritative values
    and this only acts as a floor.
    """
    if status == "completed":
        return "completed", 100
    if status == "failed":
        return "failed", 0
    now = datetime.now(timezone.utc)
    created = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
    elapsed = (now - created).total_seconds()
    pct = min(100, int(elapsed / max(1, settings.mock_render_seconds) * 100))
    if pct >= 100:
        return "completed", 100
    if pct >= 60:
        return "rendering", pct
    if pct >= 15:
        return "processing", pct
    return "queued", pct


def job_dict(j) -> dict:
    if settings.gpu_live:
        # Real GPU pipeline: the worker writes authoritative status/progress.
        # (The time-based mock below would otherwise fake "completed" after a few
        # seconds and mask a long-running or interrupted render.)
        status, progress = j.status, j.progress
    else:
        status, progress = derive_progress(j.createdAt, j.status)
        # Trust the worker if it has advanced further than the time-based floor.
        if j.progress and j.progress > progress:
            progress = j.progress
            status = j.status
    return {
        "id": j.id,
        "storySlug": j.storySlug,
        "storyTitle": j.storyTitle,
        "childName": j.childName,
        "language": j.language,
        "status": status,
        "progress": progress,
        "pages": j.pages,
        "isPurchased": j.isPurchased,
        "printApproved": j.printApproved,
        "pdfDownloadUrl": j.pdfDownloadUrl,
        "createdAt": j.createdAt.isoformat(),
    }


def order_dict(o) -> dict:
    return {
        "id": o.id,
        "status": o.status,
        "items": [
            {
                "id": it.id,
                "jobId": it.jobId or "",
                "storySlug": it.storySlug,
                "storyTitle": it.storyTitle,
                "childName": it.childName,
                "format": it.format,
                "language": it.language,
                "coverImage": it.coverImage,
                "unitPrice": it.unitPrice,
                "quantity": it.quantity,
            }
            for it in (o.items or [])
        ],
        "customer": {
            "name": o.customerName,
            "email": o.customerEmail,
            "phone": o.customerPhone,
            "address1": o.address1,
            "address2": o.address2,
            "city": o.city,
            "state": o.state,
            "pincode": o.pincode,
        },
        "subtotal": o.subtotal,
        "discount": o.discount,
        "promoCode": o.promoCode,
        "shipping": o.shipping,
        "total": o.total,
        "createdAt": o.createdAt.isoformat(),
    }
