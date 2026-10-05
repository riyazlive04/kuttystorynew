"""Put the swapped face back into the full-resolution base art.

The face-swap providers return roughly 1024px regardless of what we send them.
Printing that at 210mm is ~124 dpi, which is why prints look soft next to the
original artwork.

Almost all of the page — background, costume, props, the illustrated detail that
actually reads as "sharp" — is unchanged by the swap. Only the face is new. So
instead of printing the provider's whole downscaled frame, we keep the admin's
base art at its native resolution and paste back ONLY the face region from the
swap, feathered at the edges.

The face still gets upscaled, but a face is smooth, low-frequency content that
survives enlargement far better than castle spires or burned-in text — and it is
a small fraction of the page. Everything else stays at full resolution.
"""
from __future__ import annotations

from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

# The swap has to line up with the base art for a region paste to make sense.
# Providers preserve composition but can pad or crop slightly; beyond this the
# geometry no longer matches and pasting would tear the face out of place.
ASPECT_TOLERANCE = 0.04

# How far outside the authored face region to blend, as a fraction of the
# region's size. Enough to hide the seam without dragging in the background.
FEATHER = 0.18

# How hard to steepen the feather band after it's drawn, so a pixel that
# would have averaged roughly half the swap into half the base art instead
# resolves toward one side or the other. 1.0 leaves the blur exactly as it
# is; higher narrows the zone that stays a visible 50/50 blend.
#
# This mask is a hard polygon (or ellipse) re-blurred with a single flat
# Gaussian and no awareness of what's underneath -- the same shape of bug
# already found and fixed, independently, in generation_engine.py's swap-
# resolution composite (_keep_artwork_hair/_harden_hair_edge): a half-hair,
# half-background pixel in the band doesn't read as a soft edge, it reads as
# a pale/grey rim, because it IS a 50% mix of two different images' pixels.
#
# Deliberately conservative and deliberately NOT a change to FEATHER itself
# -- the blur's width is untouched, only how steeply its existing values
# resolve. A soft pixel or two stays right at the edge, so the seam this
# mask exists to hide is still hidden; only the band's widest, most visible
# half-and-half stretch is pulled out of the "still blending" zone.
REGION_EDGE_CONTRAST = 4.0


def _region_mask(size: tuple[int, int], face_region: dict) -> Optional[Image.Image]:
    """A feathered white-on-black mask for the authored face region."""
    W, H = size
    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)

    points = face_region.get("points")
    if points and len(points) >= 3:
        poly = [(float(x) / 100.0 * W, float(y) / 100.0 * H) for x, y in points]
        draw.polygon(poly, fill=255)
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        span = max(max(xs) - min(xs), max(ys) - min(ys))
    elif face_region.get("w") and face_region.get("h"):
        x = float(face_region["x"]) / 100.0 * W
        y = float(face_region["y"]) / 100.0 * H
        w = float(face_region["w"]) / 100.0 * W
        h = float(face_region["h"]) / 100.0 * H
        # An ellipse blends better than a box — a rectangular seam is visible
        # on skin even when feathered.
        draw.ellipse((x, y, x + w, y + h), fill=255)
        span = max(w, h)
    else:
        return None

    blur = max(2.0, span * FEATHER * 0.5)
    mask = mask.filter(ImageFilter.GaussianBlur(blur))

    try:
        import numpy as np

        arr = np.asarray(mask, dtype=np.float32) / 255.0
        arr = np.clip((arr - 0.5) * REGION_EDGE_CONTRAST + 0.5, 0.0, 1.0)
        mask = Image.fromarray((arr * 255.0).astype("uint8"), "L")
    except Exception as e:  # noqa: BLE001 -- a softer seam beats a failed page
        print(f"[reintegrate] edge steepen skipped: {e}", flush=True)

    return mask


def merge_face(
    base: Image.Image, swapped: Image.Image, face_region: Optional[dict]
) -> Optional[Image.Image]:
    """Return the base art with the swap's face pasted in, or None to skip.

    None means "use the provider's frame as-is" — no authored region to paste
    into, geometry that doesn't line up, or a base that isn't actually sharper
    than what came back.
    """
    if not face_region:
        return None

    bw, bh = base.size
    sw, sh = swapped.size
    if not (bw and bh and sw and sh):
        return None

    # Nothing to gain if the provider's frame is already as large as the base.
    if bw <= sw * 1.05:
        return None

    if abs((bw / bh) - (sw / sh)) > ASPECT_TOLERANCE * (bw / bh):
        return None

    mask = _region_mask((bw, bh), face_region)
    if mask is None:
        return None
    box = mask.getbbox()
    if not box:
        return None
    # A degenerate outline (a stray click, three identical points) would paste
    # essentially nothing — leaving the base art with NO swapped face, which is
    # far worse than a soft one. Demand a plausible face before taking this path.
    covered = (box[2] - box[0]) * (box[3] - box[1])
    if covered < 0.001 * bw * bh:
        return None

    out = base.convert("RGB")
    aligned = swapped.convert("RGB").resize((bw, bh), Image.LANCZOS)
    out.paste(aligned, (0, 0), mask)
    # The feather reaches the ears, so it would blend the full-resolution base's
    # untouched ears back over the recoloured ones. Match them here as well.
    from .config import settings

    if settings.match_surrounding_skin:
        from .skin_tone import match_surrounding_skin

        out = match_surrounding_skin(base.convert("RGB"), out, mask)
    return out
