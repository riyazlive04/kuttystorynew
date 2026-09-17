"""Trace a page's face outline with Segmind SAM3, at AUTHORING time.

Why authoring and not rendering
-------------------------------
SAM3 returns a real outline — hairline, ears, chin — where the local OpenCV
detector can only offer an ellipse. But a call takes 150-280s and costs ~0.38
credits, so running one per page mid-render would make a five-page preview take
a quarter of an hour and cost more than the swap it is helping.

Run once per plate instead, from the admin editor, and store the polygon in the
page's `facePath` — the same column a hand-traced outline uses. Renders then pay
nothing, every provider gets a true outline, and a bad trace is visible and
fixable in the editor rather than discovered in a customer's book.
"""
from __future__ import annotations

import asyncio
import base64
from typing import Optional

import httpx

from .config import settings

SAM3_URL = "https://api.segmind.com/v1/sam3-image"

# Open-vocabulary, so the wording is the discriminator. Plain "face" also
# segments the animals — verified on a unicorn page, which came back with the
# girl's face AND the unicorn's muzzle. Naming the child settles it.
FACE_PROMPT = "the young girl's face, human face only"
FACE_PROMPT_BOY = "the young boy's face, human face only"

# A face is a small part of a page. Anything outside this band is the model
# having segmented a body, a background, or nothing at all.
MIN_AREA_PCT = 0.15
MAX_AREA_PCT = 25.0

# Contour simplification: enough points to follow a jaw and an ear, few enough
# to store and to draw.
SIMPLIFY_EPS = 0.006


def _mask_to_points(mask_bytes: bytes) -> Optional[list]:
    """Largest blob in a binary mask -> [[x%, y%], ...], or None."""
    import cv2
    import numpy as np

    buf = np.frombuffer(mask_bytes, dtype=np.uint8)
    mask = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        return None
    h, w = mask.shape[:2]
    if not w or not h:
        return None

    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    area_pct = cv2.contourArea(contour) / float(w * h) * 100
    if not (MIN_AREA_PCT <= area_pct <= MAX_AREA_PCT):
        return None

    approx = cv2.approxPolyDP(
        contour, SIMPLIFY_EPS * cv2.arcLength(contour, True), True
    )
    if len(approx) < 3:
        return None

    return [
        [round(float(p[0][0]) / w * 100, 3), round(float(p[0][1]) / h * 100, 3)]
        for p in approx
    ]


async def trace_face(
    image_src: str, variant: str = "girl", timeout: float = 420.0
) -> dict:
    """Ask SAM3 for the face outline of one plate.

    Returns {"points": [...]} on success, or {"error": "..."} — a failed trace is
    reported to the admin, never raised into a render path.
    """
    from .generation_engine import _image_bytes, current_segmind_key

    api_key = current_segmind_key()
    if not api_key:
        return {"error": "SEGMIND_API_KEY not set"}

    try:
        # A sync read (and, for a remote plate, a sync HTTP fetch) — off the
        # event loop, so a trace doesn't stall every other request.
        raw = await asyncio.to_thread(_image_bytes, image_src)
        image_b64 = base64.b64encode(raw).decode()
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not read the plate: {e}"}

    payload = {
        "image": image_b64,
        "text_prompt": FACE_PROMPT_BOY if variant == "boy" else FACE_PROMPT,
        "return_preview": True,
        "return_masks": False,
        "return_overlay": False,
        "threshold": 0.5,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(
                SAM3_URL,
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )
            if r.status_code != 200:
                return {"error": f"SAM3 {r.status_code}: {(r.text or '')[:200]}"}
            mask_bytes = r.content
            credits = r.headers.get("x-remaining-credits")
    except Exception as e:  # noqa: BLE001
        return {"error": f"SAM3 call failed: {e}"}

    try:
        points = _mask_to_points(mask_bytes)
    except Exception as e:  # noqa: BLE001 -- e.g. OpenCV failing to import
        return {"error": f"could not read the mask: {type(e).__name__}: {e}"[:300],
                "credits": credits}
    if not points:
        return {"error": "no usable face mask came back", "credits": credits}

    return {"points": points, "credits": credits}


def sam3_enabled() -> bool:
    return bool(settings.sam3_autotrace_enabled)
