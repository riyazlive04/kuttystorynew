"""Carry the swapped face's skin tone onto the artwork's ears and neck.

The composite takes only the face oval from the swap, so the artwork keeps its
hair -- and its ears and neck, which stay the ILLUSTRATED child's skin tone. When
the customer's child is a shade warmer or darker than the character, the face
sits on the page like a mask: tanned face, pale ears either side, a pale neck
below, and a colour step at the jaw. That is the "distorted ears" report -- the
ears are not misshapen, they are the wrong colour.

Using the swapper's own ears instead is worse: it redraws them, adds earrings,
and moves them out from under the artwork's hair. So the artwork's ears stay,
recoloured.

How: measure the skin inside the fully-swapped core twice -- in the artwork and
in the result -- and move the artwork's skin-coloured pixels AROUND the face by
that difference, in Lab. Two gates keep it off everything else:

  * colour: only pixels whose chroma is close to the artwork's own face skin,
    so hair, clothes, a blue sky or a helmet ring are left alone;
  * distance: only within reach of the face, so a hand or a skin-toned wall
    across the page is never touched.
"""
from __future__ import annotations

from typing import Optional

from PIL import Image

# How far beyond the face the recolour reaches, as a fraction of the face's
# larger side. Ears sit about a third of a face-width out; the neck under the jaw.
REACH = 0.4

# Chroma distance (Lab a/b, OpenCV 8-bit units) from the face's skin: full
# strength up to NEAR, fading to nothing at FAR.
NEAR = 7.0
FAR = 20.0

# The core must hold enough skin to measure; anything less is a bad mask.
MIN_SKIN_PIXELS = 400

# Differences smaller than this aren't visible; don't touch the page for them.
MIN_SHIFT = 2.5


def match_surrounding_skin(
    template: Image.Image, result: Image.Image, mask: Image.Image
) -> Image.Image:
    """Return `result` with the skin around the face shifted to the face's tone.

    `template` is the untouched artwork, `result` the composite, `mask` the face
    mask the composite used (255 = fully swapped). All three the same size.
    Never raises: on any problem the result is returned unchanged.
    """
    try:
        out = _match(template, result, mask)
        return out if out is not None else result
    except Exception as e:  # noqa: BLE001 -- a tone match is never worth a failed page
        print(f"[skin-tone] skipped: {e}", flush=True)
        return result


def _match(
    template: Image.Image, result: Image.Image, mask: Image.Image
) -> Optional[Image.Image]:
    import cv2
    import numpy as np

    if not (template.size == result.size == mask.size):
        return None

    tmpl = np.asarray(template.convert("RGB"))
    res = np.asarray(result.convert("RGB"))
    m = np.asarray(mask.convert("L"), dtype=np.float32) / 255.0

    core = m > 0.95
    if core.sum() < MIN_SKIN_PIXELS:
        return None

    t_lab = cv2.cvtColor(tmpl, cv2.COLOR_RGB2LAB).astype(np.float32)
    r_lab = cv2.cvtColor(res, cv2.COLOR_RGB2LAB).astype(np.float32)

    # Skin inside the core: drop the darkest (brows, lashes, pupils, nostrils)
    # and brightest (teeth, eye whites, highlights) of the ARTWORK's pixels.
    lum = t_lab[..., 0][core]
    lo, hi = np.percentile(lum, 25), np.percentile(lum, 90)
    skin = core & (t_lab[..., 0] >= lo) & (t_lab[..., 0] <= hi)
    if skin.sum() < MIN_SKIN_PIXELS:
        return None

    t_mean = np.median(t_lab[skin], axis=0)
    r_mean = np.median(r_lab[skin], axis=0)
    delta = r_mean - t_mean
    if float(np.abs(delta).max()) < MIN_SHIFT:
        return None

    # Colour gate: chroma close to the artwork's face skin. The brightness floor
    # is only for near-black shadow; hair is already excluded by its chroma, and
    # a floor any higher skipped the shaded fold of the ear.
    chroma_d = np.hypot(t_lab[..., 1] - t_mean[1], t_lab[..., 2] - t_mean[2])
    like = np.clip((FAR - chroma_d) / (FAR - NEAR), 0.0, 1.0)
    like *= np.clip((t_lab[..., 0] - t_mean[0] * 0.25) / (t_mean[0] * 0.2), 0.0, 1.0)

    # Distance gate: grow the face mask outwards by REACH, softly.
    ys, xs = np.nonzero(m > 0.5)
    span = max(xs.max() - xs.min(), ys.max() - ys.min())
    k = max(3, int(span * REACH) | 1)
    grown = cv2.dilate(
        (m > 0.5).astype(np.uint8) * 255,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)),
    )
    zone = cv2.GaussianBlur(grown, (0, 0), sigmaX=max(2.0, k * 0.15))
    zone = zone.astype(np.float32) / 255.0

    # Only where the composite kept the artwork; the swapped face already has
    # its own tone.
    w = (zone * like * (1.0 - m))[..., None]
    if float(w.max()) <= 0.01:
        return None

    shifted = np.clip(t_lab + delta, 0, 255).astype(np.uint8)
    shifted_rgb = cv2.cvtColor(shifted, cv2.COLOR_LAB2RGB).astype(np.float32)
    diff = shifted_rgb - tmpl.astype(np.float32)
    out = np.clip(res.astype(np.float32) + diff * w, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")
