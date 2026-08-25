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
# eating into the hairline. Kept modest — an oversized region is not a softer
# failure, it is the model repainting a neck or a bunch of flowers.
BOX_GROW = 0.12
BOX_DROP = 0.05

# A detection smaller than this is scenery; larger than this is not a face on a
# storybook page. Measured across a full 28-page book: real faces ran 12-29% of
# the short edge and false positives 5-55%, so this bound alone would not sort
# them — it only rules out the absurd, and the eye check below does the work.
MIN_FACE_FRACTION = 0.05
MAX_FACE_EDGE_FRACTION = 0.45

# A face has eyes in it. This one check separated every true detection from
# every false one across that book — real faces returned two eyes, the torso and
# foliage boxes returned none — so it is the gate, not a tie-breaker.
MIN_EYES = 2

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

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    haar = cv2.data.haarcascades
    eye_cascade = cv2.CascadeClassifier(haar + "haarcascade_eye.xml")

    min_edge = int(min(dw, dh) * MIN_FACE_FRACTION)
    max_edge = min(dw, dh) * MAX_FACE_EDGE_FRACTION

    # Two cascades rather than one: they disagree about the exact framing but
    # agree about where the face is, and pooling their candidates means a face
    # one of them misses is still found.
    candidates = []
    for name in (
        "haarcascade_frontalface_default.xml",
        "haarcascade_frontalface_alt2.xml",
    ):
        cascade = cv2.CascadeClassifier(haar + name)
        if cascade.empty():
            continue
        for x, y, fw, fh in cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_edge, min_edge)
        ):
            if fw > max_edge or fh > max_edge:
                continue
            # Eyes live in the upper part of a face box; searching the whole box
            # invites a mouth or a nostril to pass for one.
            roi = gray[int(y) : int(y + fh * 0.65), int(x) : int(x + fw)]
            if roi.size == 0:
                continue
            eye_min = max(6, int(fw / 12))
            eyes = eye_cascade.detectMultiScale(
                roi, scaleFactor=1.1, minNeighbors=6, minSize=(eye_min, eye_min)
            )
            if len(eyes) >= MIN_EYES:
                candidates.append((int(x), int(y), int(fw), int(fh)))

    if not candidates:
        return None

    # The hero is the largest face that survived. Average it with any candidate
    # framing the same head — the two cascades bracket the true box, and the
    # mean of them sits better than either alone.
    anchor = max(candidates, key=lambda c: c[2] * c[3])
    ax, ay, aw, ah = anchor
    acx, acy = ax + aw / 2, ay + ah / 2
    same_head = [
        c
        for c in candidates
        if abs((c[0] + c[2] / 2) - acx) < aw * 0.25
        and abs((c[1] + c[3] / 2) - acy) < ah * 0.25
    ] or [anchor]

    x = sum(c[0] for c in same_head) / len(same_head)
    y = sum(c[1] for c in same_head) / len(same_head)
    fw = sum(c[2] for c in same_head) / len(same_head)
    fh = sum(c[3] for c in same_head) / len(same_head)

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
