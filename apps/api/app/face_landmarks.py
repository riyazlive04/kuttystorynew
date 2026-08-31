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


def forehead_spot(image_bytes: bytes) -> Optional[dict]:
    """Where an invented bindi goes, as `{x, y, rx, ry}` in PIXELS.

    An ellipse covering the lower forehead: from just above the brows up toward
    the middle of the forehead, centred on the midline. None if no face was
    found, or if mediapipe is absent.
    """
    try:
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

        gx, gy = lm[GLABELLA].x * W, lm[GLABELLA].y * H
        fx, fy = lm[MID_FOREHEAD].x * W, lm[MID_FOREHEAD].y * H
        # The strip between the two landmarks, biased toward the glabella end
        # where the mark actually sits, and never taller than the face allows.
        top = gy + (fy - gy) * 0.62
        return {
            "x": (gx + fx) / 2,
            "y": (gy + top) / 2,
            "rx": span * 0.15,
            "ry": max(span * 0.12, abs(gy - top) / 2),
        }
    except Exception as e:  # noqa: BLE001 -- absent, or it failed; either way, None
        print(f"[landmarks] forehead lookup skipped: {e}", flush=True)
        return None
