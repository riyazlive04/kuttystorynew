"""Admin API — order fulfillment + story CMS.

Auth: send `Authorization: Bearer <ADMIN_TOKEN>` (or `X-Admin-Token`).
Kept intentionally simple; swap for real user auth / RBAC in production.
"""
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from prisma import Json
from pydantic import BaseModel

from ..config import settings
from ..db import prisma
from ..pages_layout import kind_of, label_of, sort_key
from ..serializers import order_dict, story_dict

router = APIRouter(prefix="/admin", tags=["admin"])

ORDER_STATUSES = [
    "pending",
    "paid",
    "in_production",
    "shipped",
    "delivered",
    "cancelled",
]


async def require_admin(
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    token = token or x_admin_token
    if token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True


# ----------------------------- Orders -------------------------------------

@router.get("/orders", dependencies=[Depends(require_admin)])
async def admin_orders(status: Optional[str] = None):
    where = {"status": status} if status in ORDER_STATUSES else {}
    orders = await prisma.order.find_many(
        where=where, include={"items": True}, order={"createdAt": "desc"}
    )
    return [order_dict(o) for o in orders]


class StatusUpdate(BaseModel):
    status: str


@router.patch("/orders/{order_id}/status", dependencies=[Depends(require_admin)])
async def update_order_status(order_id: str, body: StatusUpdate):
    if body.status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    # Print-approval gate (Diffrun): a book must be customer-approved before it
    # can enter production/shipping.
    if body.status in ("in_production", "shipped", "delivered"):
        order = await prisma.order.find_unique(
            where={"id": order_id}, include={"previewSession": True}
        )
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        session = order.previewSession
        if session and not session.printApproved:
            raise HTTPException(
                status_code=409,
                detail="Book not approved for print yet (customer must approve).",
            )
    order = await prisma.order.update(
        where={"id": order_id},
        data={"status": body.status},
        include={"items": True},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_dict(order)


@router.delete("/orders/{order_id}", dependencies=[Depends(require_admin)])
async def admin_delete_order(order_id: str):
    """Permanently delete an order. Its line items are removed automatically
    (OrderItem.onDelete: Cascade). The linked preview session/job is left intact."""
    order = await prisma.order.find_unique(where={"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await prisma.order.delete(where={"id": order_id})
    return {"ok": True, "id": order_id}


# ----------------------------- Settings -----------------------------------

class SettingsPatch(BaseModel):
    faceOutlineEnabled: Optional[bool] = None
    # Write-only. Provide to set a new key; "" clears it; omit to leave unchanged.
    segmindApiKey: Optional[str] = None


def _segmind_status() -> dict:
    """Non-sensitive status of the effective Segmind key — never the value."""
    from ..secrets_store import get_secret

    stored = get_secret("segmind_api_key")
    key = stored or settings.segmind_api_key or ""
    if not key:
        return {"set": False, "last4": "", "source": None}
    return {"set": True, "last4": key[-4:], "source": "admin" if stored else "env"}


def _settings_response() -> dict:
    from ..app_settings import get_settings

    return {**get_settings(), "segmind": _segmind_status()}


@router.get("/settings", dependencies=[Depends(require_admin)])
async def admin_get_settings():
    return _settings_response()


@router.patch("/settings", dependencies=[Depends(require_admin)])
async def admin_update_settings(body: SettingsPatch):
    from ..app_settings import update_settings
    from ..secrets_store import set_secret

    data = body.model_dump()
    if data.get("faceOutlineEnabled") is not None:
        update_settings({"faceOutlineEnabled": data["faceOutlineEnabled"]})
    # Secret handled separately (encrypted at rest, never echoed back).
    if data.get("segmindApiKey") is not None:
        set_secret("segmind_api_key", (data["segmindApiKey"] or "").strip())
    return _settings_response()


# --------------------------- Previews (jobs) ------------------------------

@router.get("/jobs", dependencies=[Depends(require_admin)])
async def admin_list_jobs(limit: int = 200, purchased: Optional[bool] = None):
    """List generated preview sessions (newest first) so admin can review and
    download any preview — not just the ones that became orders."""
    where: dict = {}
    if purchased is not None:
        where["isPurchased"] = purchased
    jobs = await prisma.job.find_many(
        where=where or None, order={"createdAt": "desc"}, take=limit
    )
    out = []
    for j in jobs:
        pages = list(j.pages) if j.pages else []
        # Count by the page's own locked flag rather than its position: with a
        # front cover in the list, slot number no longer equals page number.
        rendered_free = sum(
            1
            for p in pages
            if (p or {}).get("imageUrl") and not (p or {}).get("locked")
        )
        out.append(
            {
                "id": j.id,
                "childName": j.childName,
                "storyTitle": j.storyTitle,
                "storySlug": j.storySlug,
                "language": j.language,
                "status": j.status,
                "progress": j.progress,
                "isPurchased": j.isPurchased,
                "printApproved": j.printApproved,
                "purged": j.purged,
                "renderedFreePages": rendered_free,
                "previewReady": rendered_free > 0,
                "createdAt": j.createdAt.isoformat(),
            }
        )
    return out


# ----------------------------- Stats --------------------------------------

@router.get("/stats", dependencies=[Depends(require_admin)])
async def admin_stats():
    orders = await prisma.order.find_many()
    paid = [o for o in orders if o.status != "pending" and o.status != "cancelled"]
    revenue = sum(o.total for o in paid)
    return {
        "orders": len(orders),
        "paidOrders": len(paid),
        "revenue": revenue,
        "jobs": await prisma.job.count(),
        "stories": await prisma.story.count(),
    }


# --------------------------- Stories CMS ----------------------------------

class StoryUpsert(BaseModel):
    slug: str
    title: str
    tagline: str
    description: str
    categoryTag: str
    ageRange: str
    minAge: int = 2
    maxAge: int = 8
    pdfPrice: int
    printPrice: int
    bilingualAddon: int = 200
    pages: int = 28
    coverImage: str
    gallery: list[str] = []
    themeColor: str = "#9333EA"
    supportsTamil: bool = True
    highlights: list[str] = []
    active: bool = True


@router.get("/stories", dependencies=[Depends(require_admin)])
async def admin_list_stories():
    stories = await prisma.story.find_many(order={"createdAt": "asc"})
    return [{**story_dict(s), "active": s.active} for s in stories]


@router.post("/stories", dependencies=[Depends(require_admin)])
async def admin_upsert_story(body: StoryUpsert):
    data = body.model_dump()
    story = await prisma.story.upsert(
        where={"slug": body.slug},
        data={"create": data, "update": data},
    )
    return {**story_dict(story), "active": story.active}


class CoverPatch(BaseModel):
    coverImage: str


@router.patch("/stories/{slug}/cover", dependencies=[Depends(require_admin)])
async def admin_update_cover(slug: str, body: CoverPatch):
    """Swap a book's cover image without re-sending the whole story record —
    what the Page Editor's cover uploader calls."""
    cover = (body.coverImage or "").strip()
    if not cover:
        raise HTTPException(status_code=400, detail="coverImage is required")
    story = await prisma.story.update(
        where={"slug": slug}, data={"coverImage": cover}
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return {**story_dict(story), "active": story.active}


@router.patch("/stories/{slug}/active", dependencies=[Depends(require_admin)])
async def admin_toggle_story(slug: str, active: bool):
    story = await prisma.story.update(where={"slug": slug}, data={"active": active})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    return {**story_dict(story), "active": story.active}


@router.delete("/stories/{slug}", dependencies=[Depends(require_admin)])
async def admin_delete_story(slug: str, force: bool = False):
    """Permanently delete a book, its page templates, and its preview sessions.

    By default, books with REAL orders (an ordered line item, or a purchased
    preview session) are protected → 409, so you don't lose order history by
    accident. Pass `force=true` to override and delete anyway: the book, its pages
    and preview sessions are removed. Order records themselves are kept (their
    story fields are denormalized), just unlinked from the deleted sessions.
    """
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    ordered_items = await prisma.orderitem.count(where={"storySlug": slug})
    purchased = await prisma.job.count(
        where={"storySlug": slug, "isPurchased": True}
    )
    blocking = ordered_items + purchased
    if blocking and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This book has {blocking} order(s). Delete anyway to remove the "
                "book (order records are kept, just unlinked)."
            ),
        )

    # Clean up preview sessions (Job rows have no cascade to Story), then delete
    # the book (pages cascade). Any order still keeps its denormalized story info.
    await prisma.job.delete_many(where={"storySlug": slug})
    await prisma.story.delete(where={"slug": slug})
    return {"ok": True, "slug": slug, "forced": bool(blocking)}


# ------------------------- Page templates (CMS) ---------------------------

def _page_dict(p) -> dict:
    return {
        "id": p.id,
        "bookTemplateId": p.bookTemplateId,
        "pageNumber": p.pageNumber,
        "baseImageUrl": p.baseImageUrl,
        "stylePrompt": p.stylePrompt,
        "faceX": p.faceX,
        "faceY": p.faceY,
        "faceW": p.faceW,
        "faceH": p.faceH,
        "facePath": p.facePath,
        "scenePrompt": p.scenePrompt,
        "storyText": p.storyText,
        "textX": p.textX,
        "textY": p.textY,
        "fontSize": p.fontSize,
        "fontColor": p.fontColor,
        "fontFamily": getattr(p, "fontFamily", None) or "sans",
        "letterSpacing": getattr(p, "letterSpacing", 0) or 0,
        "softLineBreak": getattr(p, "softLineBreak", True),
        # Derived from the reserved page numbers — the editor labels tabs with it.
        "kind": kind_of(p.pageNumber),
        "label": label_of(p.pageNumber),
    }


@router.get("/fonts", dependencies=[Depends(require_admin)])
async def admin_fonts():
    """Font families the text layer can burn in, with the CSS stack the editor
    should preview them with and whether the file is installed in this image."""
    from ..text_layer import available_families

    return available_families()


class PageUpsert(BaseModel):
    pageNumber: int
    baseImageUrl: Optional[str] = None
    stylePrompt: str = "children's storybook illustration, soft colours, consistent character, clean line art"
    faceX: Optional[float] = None
    faceY: Optional[float] = None
    faceW: Optional[float] = None
    faceH: Optional[float] = None
    facePath: Optional[list] = None  # freeform mask polygon [[x%,y%], ...]
    scenePrompt: str = ""
    storyText: str = ""
    textX: float = 50
    textY: float = 82
    fontSize: int = 42
    fontColor: str = "#FFFFFF"
    fontFamily: str = "sans"
    letterSpacing: float = 0
    softLineBreak: bool = True


@router.get("/stories/{slug}/pages", dependencies=[Depends(require_admin)])
async def admin_list_pages(slug: str):
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    pages = await prisma.pagetemplate.find_many(
        where={"bookTemplateId": story.id}, order={"pageNumber": "asc"}
    )
    # Reading order, not numeric order: front cover (0), story pages, back cover (-1).
    pages = sorted(pages, key=lambda p: sort_key(p.pageNumber))
    return [_page_dict(p) for p in pages]


@router.post("/stories/{slug}/pages", dependencies=[Depends(require_admin)])
async def admin_upsert_page(slug: str, body: PageUpsert):
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    data = {**body.model_dump(), "bookTemplateId": story.id}
    # facePath is a JSON column. Always store a list (empty = "no outline") — the
    # Prisma Python client can't set a JSON column to SQL NULL via update, and an
    # empty polygon is treated as no-mask downstream (len < 3).
    data["facePath"] = Json(data.get("facePath") or [])
    page = await prisma.pagetemplate.upsert(
        where={
            "bookTemplateId_pageNumber": {
                "bookTemplateId": story.id,
                "pageNumber": body.pageNumber,
            }
        },
        data={"create": data, "update": data},
    )
    return _page_dict(page)


@router.delete("/stories/{slug}/pages/{page_number}", dependencies=[Depends(require_admin)])
async def admin_delete_page(slug: str, page_number: int):
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await prisma.pagetemplate.delete_many(
        where={"bookTemplateId": story.id, "pageNumber": page_number}
    )
    return {"ok": True}


class GenerateBaseBody(BaseModel):
    # Optional override; defaults to the page's scenePrompt (+ stylePrompt).
    prompt: Optional[str] = None


@router.post(
    "/stories/{slug}/pages/{page_number}/generate-base",
    dependencies=[Depends(require_admin)],
)
async def admin_generate_base_art(slug: str, page_number: int, body: GenerateBaseBody):
    """Generate a page's GENERIC base illustration ONCE via flux txt2img and save
    it as PageTemplate.baseImageUrl. Costs one Replicate render. The base art
    shows a generic child character; each customer's face is later swapped in."""
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    page = await prisma.pagetemplate.find_first(
        where={"bookTemplateId": story.id, "pageNumber": page_number}
    )
    if not page:
        raise HTTPException(status_code=404, detail="Page not found — save the page first")

    scene = (body.prompt or page.scenePrompt or "").strip()
    if not scene:
        raise HTTPException(
            status_code=400, detail="Set a scene prompt on the page before generating"
        )
    style = (page.stylePrompt or "").strip()
    # A generic child (no specific identity) so a real face can be swapped in later.
    prompt = ", ".join(
        p for p in [scene, style, "a single generic child character, no text"] if p
    )

    from ..generation_engine import generate_base_art

    try:
        data = await generate_base_art(scene_prompt=prompt, seed=page_number * 7)
    except Exception as e:  # surface the failure to the admin UI
        raise HTTPException(status_code=502, detail=f"Base-art generation failed: {e}")

    name = f"base_{story.id}_p{page_number}_{uuid.uuid4().hex[:8]}.webp"
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    url = f"/uploads/{name}"

    page = await prisma.pagetemplate.update(
        where={"id": page.id}, data={"baseImageUrl": url}
    )
    return _page_dict(page)


DEFAULT_STYLE_PROMPT = (
    "children's storybook illustration, soft warm colours, consistent character, "
    "clean line art, whimsical, gentle lighting"
)


class GenerateStoryBody(BaseModel):
    numPages: int = 13
    premise: Optional[str] = None
    gender: str = "neutral"
    stylePrompt: Optional[str] = None
    replace: bool = True  # overwrite the book's existing pages


@router.post(
    "/stories/{slug}/generate-story", dependencies=[Depends(require_admin)]
)
async def admin_generate_story(slug: str, body: GenerateStoryBody):
    """Author a full, coherent, personalized story for the book via an LLM and
    save it as PageTemplates (per-page narrative with {{name}} + scene prompt +
    a consistent style). Diffrun-style: authored once, name-swapped per child."""
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    from ..story_generator import active_provider, generate_story_pages

    n = max(1, min(28, body.numPages))
    try:
        pages = await generate_story_pages(
            title=story.title,
            premise=body.premise or story.description or story.tagline,
            num_pages=n,
            min_age=story.minAge,
            max_age=story.maxAge,
            gender=body.gender,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Story generation failed: {e}")

    style = (body.stylePrompt or "").strip() or DEFAULT_STYLE_PROMPT
    if body.replace:
        # Story pages only — the authored covers (page 0 / -1) are not part of the
        # narrative and must survive a re-author.
        await prisma.pagetemplate.delete_many(
            where={"bookTemplateId": story.id, "pageNumber": {"gte": 1}}
        )

    out = []
    for p in pages:
        fields = {
            "scenePrompt": p["scenePrompt"],
            "storyText": p["storyText"],
            "stylePrompt": style,
            "textX": 50.0,
            "textY": 85.0,
            "fontSize": 42,
            "fontColor": "#FFFFFF",
        }
        page = await prisma.pagetemplate.upsert(
            where={
                "bookTemplateId_pageNumber": {
                    "bookTemplateId": story.id,
                    "pageNumber": p["pageNumber"],
                }
            },
            data={
                "create": {
                    "bookTemplateId": story.id,
                    "pageNumber": p["pageNumber"],
                    **fields,
                },
                "update": fields,
            },
        )
        out.append(_page_dict(page))
    return {"provider": active_provider(), "count": len(out), "pages": out}


class GenerateBaseArtBody(BaseModel):
    overwrite: bool = False


@router.post(
    "/stories/{slug}/generate-base-art", dependencies=[Depends(require_admin)]
)
async def admin_generate_book_base_art(slug: str, body: GenerateBaseArtBody):
    """Generate the FIXED base illustration for every page of the book (one-time),
    so the fixed-template + face-personalization pipeline has consistent art.
    Runs in the background (many renders)."""
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    count = await prisma.pagetemplate.count(where={"bookTemplateId": story.id})
    if not count:
        raise HTTPException(status_code=400, detail="Author the story pages first")
    try:
        from ..tasks import generate_book_base_art

        generate_book_base_art.delay(story.id, body.overwrite)
    except Exception:
        raise HTTPException(status_code=503, detail="Render queue unavailable")
    return {"ok": True, "pages": count, "status": "generating"}
