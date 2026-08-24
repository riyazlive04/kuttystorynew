"""Side-by-side image-provider comparison.

Runs ONE page through every configured provider with identical inputs — same
base plate, same photo, same authored face region, same composite step — so the
only variable is the provider itself.

Two audiences, one endpoint:

* **Admin** (valid admin token) sees vendor names, elapsed time and an indicative
  per-image cost, which is what a provider decision actually turns on.
* **Storefront** (anonymous) sees neutral "Style A / Style B" tiles. Customers
  have no reason to learn our vendor stack or our unit economics, and a tile
  labelled with a vendor name reads as an internal tool left switched on.

Abuse controls, because this endpoint spends money on an anonymous request:

* Per-IP rate limit (see ratelimit.py), failing closed.
* Only the story's DEMO PAGE renders — never an arbitrary page. Otherwise the
  endpoint is a way to render an entire book, page by page, for free.
* Uploads land in the same storage volume the retention sweep already purges.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, UploadFile

from ..config import settings
from ..db import prisma
from ..pages_layout import FRONT_COVER, normalize_variant
from ..ratelimit import RateLimited, check_and_consume, client_key

router = APIRouter(prefix="/compare", tags=["compare"])

ALLOWED = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 12 * 1024 * 1024  # a face photo; far below the 40MB base-art cap

# Positional labels for the storefront. Index matches available_providers()'
# stable ordering, so "Style A" means the same provider across two uploads.
NEUTRAL_LABELS = ["Style A", "Style B", "Style C", "Style D"]


def _is_admin(authorization: Optional[str], x_admin_token: Optional[str]) -> bool:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    token = token or x_admin_token
    return bool(token) and token == settings.admin_token


async def _demo_page(slug: str, variant: str):
    """The one page a story may be compared on.

    The front cover, falling back to the lowest-numbered page that has base art.
    Deliberately NOT caller-controlled — a page number parameter would turn this
    into free book rendering.
    """
    story = await prisma.story.find_unique(where={"slug": slug})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    pages = await prisma.pagetemplate.find_many(
        where={"bookTemplateId": story.id, "variant": variant},
        order={"pageNumber": "asc"},
    )
    usable = [p for p in pages if (p.baseImageUrl or "").strip()]
    if not usable:
        raise HTTPException(
            status_code=400,
            detail="This story has no base artwork to compare against yet.",
        )
    for p in usable:
        if p.pageNumber == FRONT_COVER:
            return story, p
    return story, usable[0]


def _face_region(page) -> Optional[dict]:
    """Same precedence the render pipeline uses: lasso first, then the box."""
    from ..app_settings import face_outline_enabled

    if not face_outline_enabled():
        return None
    path = getattr(page, "facePath", None)
    if path and len(path) >= 3:
        return {"points": path}
    if page.faceX is not None and page.faceW is not None:
        return {"x": page.faceX, "y": page.faceY, "w": page.faceW, "h": page.faceH}
    return None


@router.post("")
async def compare_providers(
    request: Request,
    file: UploadFile = File(...),
    slug: str = Form(...),
    variant: str = Form("boy"),
    authorization: Optional[str] = Header(default=None),
    x_admin_token: Optional[str] = Header(default=None),
):
    if not settings.compare_enabled:
        raise HTTPException(status_code=404, detail="Comparison is turned off")

    admin = _is_admin(authorization, x_admin_token)

    # Admins aren't rate limited — they're authenticated, and they're the ones
    # who need to iterate on a plate.
    if not admin:
        try:
            check_and_consume(
                client_key(request, "compare"),
                settings.compare_rate_limit,
                settings.compare_rate_window_seconds,
            )
        except RateLimited as e:
            raise HTTPException(
                status_code=429,
                detail="You've used your free tries for now. Please try again later.",
                headers={"Retry-After": str(e.retry_after)},
            )

    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WEBP images")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Photo too large (max {MAX_BYTES // (1024 * 1024)}MB)",
        )

    variant = normalize_variant(variant)
    story, page = await _demo_page(slug, variant)

    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[
        file.content_type
    ]
    name = f"cmp_{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    photo_url = f"/uploads/{name}"

    from ..generation_engine import (
        PROVIDER_LABELS,
        available_providers,
        personalize_with,
        provider_est_cost,
    )

    providers = available_providers()
    if not providers:
        raise HTTPException(
            status_code=503, detail="No image provider is configured."
        )

    region = _face_region(page)

    async def run(provider: str) -> dict:
        started = time.monotonic()
        try:
            url = await personalize_with(
                provider,
                target_src=page.baseImageUrl,
                face_src=photo_url,
                style_prompt=page.stylePrompt,
                face_region=region,
                seed=0,
                # A comparison is a preview, not a paid render: bill the cheap tier.
                is_preview=True,
            )
            return {"provider": provider, "url": url, "ms": int((time.monotonic() - started) * 1000)}
        except Exception as e:  # noqa: BLE001 — one provider failing must not
            # sink the whole comparison; the tile reports its own error instead.
            return {
                "provider": provider,
                "url": None,
                "ms": int((time.monotonic() - started) * 1000),
                "error": str(e)[:300],
            }

    results = await asyncio.gather(*(run(p) for p in providers))

    tiles = []
    for i, r in enumerate(results):
        tile = {
            "id": r["provider"] if admin else f"style-{i}",
            "label": PROVIDER_LABELS.get(r["provider"], r["provider"])
            if admin
            else NEUTRAL_LABELS[i % len(NEUTRAL_LABELS)],
            "url": r["url"],
        }
        if r.get("error"):
            # Anonymous callers get a generic message — a provider error can carry
            # vendor names and internal detail.
            tile["error"] = r["error"] if admin else "This style couldn't be generated."
        if admin:
            tile["ms"] = r["ms"]
            tile["estCostUsd"] = provider_est_cost(
                r["provider"], settings.openai_preview_quality
            )
        tiles.append(tile)

    return {
        "storySlug": story.slug,
        "pageNumber": page.pageNumber,
        "variant": variant,
        "basePlateUrl": page.baseImageUrl if admin else None,
        "photoUrl": photo_url if admin else None,
        "tiles": tiles,
    }
