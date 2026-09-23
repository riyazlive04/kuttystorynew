"""Where the features are on a face, including a drawn one.

The Haar cascades in `face_detect` answer "is there a face here, roughly" well
enough to place a swap region. They cannot answer "where exactly is the point
between the brows", which is what removing an invented bindi needs: measured
across the 29 illustrated plates on the storefront, a glabella estimated from
Haar eye boxes landed on hair often enough to be unusable, while a landmark mesh
found all 29 and put the point between the brows on every one.

Mediapipe is a heavier dependency than a cascade, and it is loaded lazily and
allowed to be absent: without it these functions return None and every caller
falls back to leaving the image alone.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

# Mesh indices. 168 is the glabella, at the top of the nose bridge; 151 is the
# middle of the forehead above it. A bindi sits BETWEEN the two -- measured on
# marked plates, about a third of an eye span above the glabella, which is why
# a patch centred on the glabella alone missed it. 33 and 263 are the outer eye
# corners, whose separation is the natural scale for anything on a face.
GLABELLA = 168
MID_FOREHEAD = 151
EYE_OUTER_L = 33
EYE_OUTER_R = 263
# Face-edge points at ear height (the tragus side of each cheek), the jaw below
# each ear, the brows' outer ends and the chin -- enough to place both ears and
# a brow-to-chin face box without the full oval, which climbs into the hair.
CHEEK_EDGE_L = 234
CHEEK_EDGE_R = 454
JAW_L = 132
JAW_R = 361
BROW_L = 105
BROW_R = 334
CHIN = 152


@lru_cache(maxsize=1)
def _mesh():
    """One mesh, built on first use. Constructing it costs ~1s."""
    import mediapipe as mp

    return mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        # Drawn faces score lower than photographs; 0.3 found every plate we
        # tested without picking up anything that was not a face.
        min_detection_confidence=0.3,
    )


def _landmarks(image_bytes: bytes):
    """(landmarks, W, H, eye span px) or None."""
    import cv2
    import numpy as np

    img = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    result = _mesh().process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if not result.multi_face_landmarks:
        return None
    H, W = img.shape[:2]
    lm = result.multi_face_landmarks[0].landmark
    span = abs(lm[EYE_OUTER_R].x - lm[EYE_OUTER_L].x) * W
    if span < 8:
        return None
    return lm, W, H, span


def ear_spots(image_bytes: bytes) -> Optional[list]:
    """Both ears, as `[{x, y, rx, ry}, ...]` in PIXELS, or None.

    The swapper redraws the ears it is given and decorates them -- an earring
    stud on a boy who has none. Ellipses reaching from just inside the cheek edge
    out past where an ear sits, from eye height down past the lobe, so the
    composite can take the artwork's ears instead.
    """
    try:
        found = _landmarks(image_bytes)
        if not found:
            return None
        lm, W, H, span = found
        out = []
        for edge, jaw, sign in ((CHEEK_EDGE_L, JAW_L, -1), (CHEEK_EDGE_R, JAW_R, 1)):
            ex, ey = lm[edge].x * W, lm[edge].y * H
            jy = lm[jaw].y * H
            top = ey - span * 0.30
            bottom = max(jy, ey + span * 0.35) + span * 0.10
            out.append({
                # Centred just outside the cheek edge; the inner rim overlaps the
                # cheek a little so the lobe's join to the jaw is covered too.
                "x": ex + sign * span * 0.16,
                "y": (top + bottom) / 2,
                "rx": span * 0.30,
                "ry": (bottom - top) / 2,
            })
        return out
    except Exception as e:  # noqa: BLE001
        print(f"[landmarks] ear lookup skipped: {e}", flush=True)
        return None


def face_box(image_bytes: bytes) -> Optional[dict]:
    """A brow-to-chin, cheek-to-cheek region in PERCENT, or None.

    The fallback when the Haar cascades find no face on an untraced plate --
    without a region the whole swapped head is used as-is, decorations and all.
    Same shape as face_detect's region, so every consumer treats it alike.
    """
    try:
        found = _landmarks(image_bytes)
        if not found:
            return None
        lm, W, H, span = found
        left = lm[CHEEK_EDGE_L].x * W + span * 0.04
        right = lm[CHEEK_EDGE_R].x * W - span * 0.04
        top = min(lm[BROW_L].y, lm[BROW_R].y) * H
        bottom = lm[CHIN].y * H + span * 0.04
        if right - left < 8 or bottom - top < 8:
            return None
        return {
            "x": round(max(0.0, left) / W * 100, 3),
            "y": round(max(0.0, top) / H * 100, 3),
            "w": round((right - left) / W * 100, 3),
            "h": round((bottom - top) / H * 100, 3),
            "auto": True,
        }
    except Exception as e:  # noqa: BLE001
        print(f"[landmarks] face box skipped: {e}", flush=True)
        return None


def brow_line(image_bytes: bytes) -> Optional[dict]:
    """The brow line as `{y, span}` in PIXELS, or None.

    The boundary between "hair" and "face". Everything above it on an
    illustrated plate is forehead and fringe; the eyebrows sit on it. A hair
    guard needs that line because the only cheap way to tell hair from an
    eyebrow is that both are dark and one of them is higher up.

    `span` comes back with it so a caller can soften the cut in proportion to
    the face rather than by a fixed number of pixels.
    """
    try:
        found = _landmarks(image_bytes)
        if not found:
            return None
        lm, W, H, span = found
        return {"y": min(lm[BROW_L].y, lm[BROW_R].y) * H, "span": span}
    except Exception as e:  # noqa: BLE001
        print(f"[landmarks] brow line skipped: {e}", flush=True)
        return None


def forehead_spot(image_bytes: bytes) -> Optional[dict]:
    """Where an invented bindi goes, as `{x, y, rx, ry}` in PIXELS.

    An ellipse covering the lower forehead: from just above the brows up toward
    the middle of the forehead, centred on the midline. None if no face was
    found, or if mediapipe is absent.
    """
    try:
        found = _landmarks(image_bytes)
        if not found:
            return None
        lm, W, H, span = found

        gx, gy = lm[GLABELLA].x * W, lm[GLABELLA].y * H
        fx, fy = lm[MID_FOREHEAD].x * W, lm[MID_FOREHEAD].y * H
        # The whole strip from the glabella up to mid-forehead. It used to stop
        # 62% of the way up, biased to where the mark "usually" sits -- and on a
        # real invented bindi (Moonstone, flying-lessons plate) the dot sat right
        # on the patch's top rim and survived its soft edge. What goes back is
        # the artwork's own forehead, so covering more costs nothing.
        top = fy
        return {
            "x": (gx + fx) / 2,
            "y": (gy + top) / 2,
            "rx": span * 0.12,  # narrower than the brows are apart: the child keeps their brows
            "ry": max(span * 0.12, abs(gy - top) / 2),
        }
    except Exception as e:  # noqa: BLE001 -- absent, or it failed; either way, None
        print(f"[landmarks] forehead lookup skipped: {e}", flush=True)
        return None
