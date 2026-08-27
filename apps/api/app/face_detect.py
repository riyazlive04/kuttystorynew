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
#  Judging an uploaded photo                                                    #
# --------------------------------------------------------------------------- #
#
# The swap can only be as good as the face it is given. Measured on a real
# customer photo, the face was 30% of the frame and still came back soft -- the
# child was moving -- and no downstream parameter recovers that.
#
# This scores a photo so the WIZARD can say so while the parent still has the
# phone in their hand, and so the best of several uploads can be the one that
# drives the book. It never rejects anything on its own: the verdict is shown,
# the parent decides.

# Sharpness is measured on the face resized to this, never upscaled to it.
# Variance-of-Laplacian is strongly resolution-dependent -- the SAME face
# measured 45 at 350px and 518 at 122px, so an unnormalised threshold would call
# small photos sharp and large ones blurry. Downscaling to a fixed size fixes
# that; upscaling to it does not, which is what MIN_MEASURABLE_FACE is for.
SHARPNESS_CANVAS = 256
MIN_MEASURABLE_FACE = 180

# Relative sharpness = Laplacian variance / image variance, x100. Dividing out
# the contrast stops a high-contrast photo reading as sharp on that alone.
#
# Calibration, on the one real customer photo available: it measures 5.7 and
# swaps WELL, so the bar sits some way below it -- progressively blurring that
# same photo gave 3.3, 1.4, 0.6, and the k=7 (1.4) version is where it stops
# being usable. These are provisional and worth revisiting against a batch of
# real uploads; the cost of getting them slightly wrong is a note the parent can
# ignore, not a blocked upload.
SHARPNESS_POOR = 2.0
SHARPNESS_SOFT = 3.5

# Below this the face is a small part of the frame -- the parent stood too far
# back, and there is little detail to swap from however sharp the shot is.
FACE_FRACTION_SMALL = 0.04

_ANALYSIS_CACHE: dict[str, dict] = {}


def _relative_sharpness(face) -> Optional[float]:
    """Scale-normalised sharpness of a face crop, or None if it is too small to
    measure honestly."""
    import cv2

    h, w = face.shape[:2]
    if min(h, w) < MIN_MEASURABLE_FACE:
        return None
    face = cv2.resize(
        face, (SHARPNESS_CANVAS, SHARPNESS_CANVAS), interpolation=cv2.INTER_AREA
    )
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY).astype("float64")
    contrast = gray.var()
    if contrast < 1.0:  # a flat crop has no sharpness to speak of
        return 0.0
    return float(cv2.Laplacian(gray, cv2.CV_64F).var() / contrast * 100.0)


def analyse_photo(image_bytes: bytes) -> dict:
    """What this photo will and will not give the swapper.

    Returns a dict the API and the wizard both speak:

        ok            bool   -- usable without a caveat
        score         float  -- 0-1, only for RANKING several photos
        verdict       str    -- no_face | small | blurry | soft | good
        message       str    -- one sentence for the parent, or ""
        sharpness     float | None
        faceFraction  float
    """
    if not image_bytes:
        return {"ok": False, "score": 0.0, "verdict": "no_face", "message":
                "We could not find a face in this photo.", "sharpness": None,
                "faceFraction": 0.0}

    key = hashlib.sha256(image_bytes).hexdigest()
    if key in _ANALYSIS_CACHE:
        return _ANALYSIS_CACHE[key]

    def done(result: dict) -> dict:
        if len(_ANALYSIS_CACHE) >= _CACHE_MAX:
            _ANALYSIS_CACHE.clear()
        _ANALYSIS_CACHE[key] = result
        return result

    try:
        import cv2
        import numpy as np
    except ImportError:  # pragma: no cover -- no opencv, no opinion
        return {"ok": True, "score": 0.0, "verdict": "good", "message": "",
                "sharpness": None, "faceFraction": 0.0}

    region = detect_face_region(image_bytes)
    if not region:
        return done({
            "ok": False, "score": 0.0, "verdict": "no_face",
            "message": "We could not find a clear face in this photo. A "
                       "front-facing photo works best.",
            "sharpness": None, "faceFraction": 0.0,
        })

    img = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return done({"ok": True, "score": 0.0, "verdict": "good", "message": "",
                     "sharpness": None, "faceFraction": 0.0})

    H, W = img.shape[:2]
    x = max(0, int(region["x"] / 100 * W))
    y = max(0, int(region["y"] / 100 * H))
    w = int(region["w"] / 100 * W)
    h = int(region["h"] / 100 * H)
    face = img[y : y + h, x : x + w]
    if face.size == 0:
        return done({"ok": True, "score": 0.0, "verdict": "good", "message": "",
                     "sharpness": None, "faceFraction": 0.0})

    fraction = (w * h) / float(W * H)
    sharpness = _relative_sharpness(face)

    if fraction < FACE_FRACTION_SMALL or sharpness is None:
        verdict, ok = "small", False
        message = ("Your child's face is small in this photo. Closer in, filling "
                   "more of the frame, gives a much better likeness.")
    elif sharpness < SHARPNESS_POOR:
        verdict, ok = "blurry", False
        message = ("This photo looks blurry, so the face in the book may not look "
                   "much like your child. A sharper one would work better.")
    elif sharpness < SHARPNESS_SOFT:
        verdict, ok = "soft", False
        message = ("This photo is a little soft. It will work, but a sharper one "
                   "would look more like your child.")
    else:
        verdict, ok, message = "good", True, ""

    # For ranking only. Both terms saturate: past a point a bigger or sharper
    # face stops adding identity, and without a ceiling one would dominate.
    score = min(fraction / 0.10, 1.0) * min((sharpness or 0.0) / 6.0, 1.0)

    return done({
        "ok": ok, "score": round(score, 4), "verdict": verdict,
        "message": message,
        "sharpness": None if sharpness is None else round(sharpness, 2),
        "faceFraction": round(fraction, 4),
    })


def analyse_photo_for(src: Optional[str]) -> dict:
    """Same, for an image the engine knows how to fetch."""
    from .generation_engine import _image_bytes

    try:
        return analyse_photo(_image_bytes(src or ""))
    except Exception as e:  # noqa: BLE001 -- an unreadable photo gets no opinion
        print(f"[face-detect] could not analyse {src}: {e}", flush=True)
        return {"ok": True, "score": 0.0, "verdict": "good", "message": "",
                "sharpness": None, "faceFraction": 0.0}


def rank_photos(srcs: list[str]) -> list[tuple[str, dict]]:
    """Every photo with its analysis, best first. Nothing is dropped -- the
    caller decides what to do, and the parent is told what was decided."""
    scored = [(s, analyse_photo_for(s)) for s in (srcs or []) if s]
    return sorted(scored, key=lambda pair: pair[1]["score"], reverse=True)
