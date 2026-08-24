"""Find the hero's face in a base plate when nobody has traced one.

Why this exists
---------------
The swappers replace the whole HEAD — face and hair together. Keeping the
template's hair is what the face-region composite does: it takes only the
authored face oval from the swap and pastes it over the untouched plate. With no
authored region there is no oval, the full-head swap is used as-is, and the
child's hair (or a mangled approximation of it) replaces the artwork's — the
"distorted hair" everyone notices first.

Tracing every page by hand is the ideal, and an authored region always wins. But
an untraced page should not silently fall back to the worst-looking path, so we
detect the face ourselves and synthesise the same kind of region.

The detector is a stock OpenCV Haar cascade: no network call, no model download,
deterministic output. This artwork is near-photoreal, which is what the cascade
was trained on; a flatter cartoon style may not detect, and that case degrades to
exactly today's behaviour rather than to something wrong.
"""
from __future__ import annotations

import hashlib
from typing import Optional

# How much to grow the detector's box, and how far to bias it downwards. Haar
# returns a tight brow-to-lip box: grown, it reaches the jaw; dropped, it stops
# eating into the hairline. Tuned against the storefront's own base art.
BOX_GROW = 0.18
BOX_DROP = 0.08

# A detection smaller than this is scenery (a background face, an animal's eye);
# larger than this is a false positive on the whole canvas.
MIN_FACE_FRACTION = 0.05
MAX_FACE_AREA_FRACTION = 0.60

# Detection runs on a downscaled copy — the result is in percent, so precision at
# full resolution buys nothing but seconds.
DETECT_MAX_EDGE = 1200

# Plates are reused across every page render and every job, so the same handful
# of images would otherwise be re-detected constantly.
_CACHE: dict[str, Optional[dict]] = {}
_CACHE_MAX = 256


def _detect(image_bytes: bytes) -> Optional[dict]:
    try:
        import cv2
        import numpy as np
    except ImportError:  # pragma: no cover - opencv missing means no autodetect
        return None

    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        return None

    h, w = img.shape[:2]
    if not w or not h:
        return None

    scale = min(1.0, DETECT_MAX_EDGE / float(max(w, h)))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
    dh, dw = img.shape[:2]

    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if cascade.empty():
        return None

    min_edge = int(min(dw, dh) * MIN_FACE_FRACTION)
    faces = cascade.detectMultiScale(
        cv2.cvtColor(img, cv2.COLOR_BGR2GRAY),
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(min_edge, min_edge),
    )
    if len(faces) == 0:
        return None

    # The hero's face is the big one. A children's page routinely also contains
    # an animal or a background character the cascade will happily report.
    x, y, fw, fh = max(faces, key=lambda f: int(f[2]) * int(f[3]))
    if (fw * fh) > (dw * dh * MAX_FACE_AREA_FRACTION):
        return None

    cx = x + fw / 2
    cy = y + fh / 2 + fh * BOX_DROP
    bw = fw * (1 + BOX_GROW)
    bh = fh * (1 + BOX_GROW)
    left = max(0.0, cx - bw / 2)
    top = max(0.0, cy - bh / 2)
    bw = min(bw, dw - left)
    bh = min(bh, dh - top)

    # Plain floats, not numpy scalars: this dict is json.dumps()'d into the
    # OpenAI cache key and handed to code that has no reason to know about numpy.
    return {
        "x": round(float(left) / dw * 100, 3),
        "y": round(float(top) / dh * 100, 3),
        "w": round(float(bw) / dw * 100, 3),
        "h": round(float(bh) / dh * 100, 3),
        "auto": True,
    }


def detect_face_region(image_bytes: bytes) -> Optional[dict]:
    """A {x, y, w, h} region in PERCENT, or None if no face was found.

    Same shape the admin editor stores, so every downstream consumer — the
    hair-keeping composite, the OpenAI crop, the full-resolution re-seat — treats
    it exactly like a traced one.
    """
    if not image_bytes:
        return None
    key = hashlib.sha256(image_bytes).hexdigest()
    if key in _CACHE:
        return _CACHE[key]

    try:
        region = _detect(image_bytes)
    except Exception as e:  # noqa: BLE001 — detection must never fail a render
        print(f"[face-detect] skipped: {e}", flush=True)
        region = None

    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.clear()
    _CACHE[key] = region
    return region


def detect_face_region_for(src: Optional[str]) -> Optional[dict]:
    """Same, for an image the engine knows how to fetch (URL or /uploads path)."""
    if not src:
        return None
    from .generation_engine import _image_bytes

    try:
        return detect_face_region(_image_bytes(src))
    except Exception as e:  # noqa: BLE001
        print(f"[face-detect] could not read {src}: {e}", flush=True)
        return None
