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

# How much to grow the detector's box, and how far to bias it downwards.
#
# A Haar frontal box spans roughly EYEBROW to UPPER LIP — it is not a face, it
# is the middle of one. Grown uniformly it stays that shape, and the region then
# excludes the chin, the jawline and the forehead: exactly the geometry a viewer
# reads as "that's him". Swapping only the inside of it leaves the illustration's
# own jaw and chin in place, and the result looks like the character wearing the
# child's eyes rather than the child.
#
# So the growth is anisotropic — a face is taller than the box, not wider — and
# the drop puts most of the extra height below the lip, where the chin is,
# instead of up into the hair. Verified by overlay on a storefront plate and on a
# customer photo: brow-to-lip before, hairline-to-chin after.
#
# This is safe to grow now in a way it was not when these values were first set.
# Back then an oversized region meant a false positive (a torso, foliage) got
# painted; the eye gate below has since made every surviving candidate a real
# face, and growth around a real face lands on more face.
BOX_GROW_W = 0.18
BOX_GROW_H = 0.44
BOX_DROP = 0.11

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
    bw = fw * (1 + BOX_GROW_W)
    bh = fh * (1 + BOX_GROW_H)
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


# --------------------------------------------------------------------------- #
#  Choosing between the customer's photos, and levelling the one we choose      #
# --------------------------------------------------------------------------- #
#
# The wizard accepts up to three photos and every render used the first one --
# whichever the customer happened to pick first in the file dialog. That is not
# a neutral default: a parent uploads a good portrait and two casual snaps, and
# there is no reason the good one is first. Nothing about this costs an API call
# or a model download; the information was already on disk.


_QUALITY_CACHE: dict[str, float] = {}


def face_quality(image_bytes: bytes) -> float:
    """How much identity a swapper can actually read out of this photo.

    Three things decide it, and they multiply rather than average, because a
    photo that fails any one of them is unusable however well it does on the
    others:

      * a face was found at all, with both eyes -- no face, no identity;
      * how large it is, since a face 12% of the frame is a few hundred pixels
        that no amount of upscaling puts detail back into;
      * how sharp it is. Measured on a real customer photo the face scored 38 on
        variance-of-Laplacian against ~300 for a crisp one: the child was moving.
        Motion blur is the single thing here that no downstream parameter can
        recover from, so it is weighted like the hard gate it is.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:  # pragma: no cover
        return 0.0
    # Every page of a book scores the same handful of photos, so without this a
    # 28-page render decodes each of them 28 times to compute a constant.
    key = hashlib.sha256(image_bytes).hexdigest()
    if key in _QUALITY_CACHE:
        return _QUALITY_CACHE[key]
    region = detect_face_region(image_bytes)
    if not region:
        _QUALITY_CACHE[key] = 0.0
        return 0.0
    buf = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        return 0.0
    H, W = img.shape[:2]
    x = int(region["x"] / 100 * W)
    y = int(region["y"] / 100 * H)
    w = int(region["w"] / 100 * W)
    h = int(region["h"] / 100 * H)
    face = img[max(0, y) : y + h, max(0, x) : x + w]
    if face.size == 0:
        return 0.0
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    size = (w * h) / float(W * H)
    # Both terms saturate: past a point a bigger or sharper face stops adding
    # identity, and without a ceiling one dimension would dominate the choice.
    score = min(size / 0.10, 1.0) * min(sharpness / 300.0, 1.0)
    if len(_QUALITY_CACHE) >= _CACHE_MAX:
        _QUALITY_CACHE.clear()
    _QUALITY_CACHE[key] = score
    return score


def best_photo(srcs: list[str]) -> Optional[str]:
    """The photo of these to hand the swapper, or None if none has a face."""
    best, best_score = None, 0.0
    for src in srcs or []:
        if not src:
            continue
        try:
            from .generation_engine import _image_bytes

            score = face_quality(_image_bytes(src))
        except Exception as e:  # noqa: BLE001 -- a photo we cannot read is not a candidate
            print(f"[face-detect] could not score {src}: {e}", flush=True)
            continue
        print(f"[face-detect] photo quality {score:.3f} {src}", flush=True)
        if score > best_score:
            best, best_score = src, score
    return best
