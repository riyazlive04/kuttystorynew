"""Paste the child's OWN hair onto the generated page, instead of asking the
swapper to invent a hairstyle for them.

Why this exists
----------------
`_segmind_faceswap`'s own docstring already documents the limit this works
around: faceswap-comic (and, measured separately, faceswap-v4) is a diffusion
model that GENERATES hair to fill the swapped region rather than transferring
the child's. A toddler with short, buzzed hair comes back with a generic
fuller hairstyle however the strength dials are set -- confirmed again on
faceswap-v4, which also introduces its own pasted-photo look.

No prompt or parameter fixes this: the model was never shown the child's real
hair geometry, only told to imagine some. The only way to put the real hair on
the page is to cut it out of the photo and paste it in ourselves.

Approach
--------
1. Segment the child's hair from the SAME crop that was sent to Segmind
   (`_b64_face`'s crop), via SAM3 text-prompted segmentation -- the only
   segmenter already wired into this codebase that works on an arbitrary
   image, not just the illustrated plates `hair_smooth.py` is tuned for.
2. Find matching anchor points on the photo and on the generated page using
   `face_landmarks` -- mediapipe runs on both a photograph and a drawn face
   (confirmed in face_landmarks.py's own docstring), so the eye-outer-corner
   span and brow line give a scale + position anchor common to both spaces.
3. Warp the segmented hair patch from photo space into page space with that
   anchor (similarity transform: scale + rotate + translate -- not a full
   perspective warp, which would need more than two anchor points to be
   well-posed), then composite it using the same feather + Lab edge-steepen
   idiom as `_keep_artwork_hair` / `reintegrate._region_mask`, so a half
   photo/half artwork pixel resolves to one side instead of averaging into a
   pale rim.
4. Gated to near-frontal photos: the similarity transform only holds up to
   a small rotation between the photo's and the page's face angle. Past that,
   hair drawn for one angle pasted at another looks pasted, not combed -- so
   large angle differences fall back to the existing AI-generated hair
   untouched rather than force a bad warp.
5. Stylize the segmented patch before compositing: bilateral-smooth it,
   recolour its hue/saturation to match the AI-drawn hair sampled from THIS
   page (not a generic saturation boost -- tried first, made it worse, see
   below), feather wide and cap at partial opacity so it reads as a tint
   rather than a hard replacement.

STATUS: built, wired in, and verified end-to-end on a real render (toddler
"Magizhan", space-explorer cover) -- but still NOT good enough to ship. Every
stage up through step 4 is confirmed pixel-correct: the SAM3 mask matches the
real hairline, the landmark anchors are right, the warp preserves colour
within ~1 RGB unit, the angle gate correctly declines bad photos (caught a
genuine ~90 degree rotation from a since-fixed EXIF bug, see color.py). Step 5
went through FOUR rounds, each fixing a real, verified bug, and the result is
STILL an obvious flat patch, not illustrated hair:

  a) generic saturation/value boost + posterize -> blotchy teal/grey bands
     (amplified the photo's own cool-toned hue instead of correcting it)
  b) replaced hue/sat with the PAGE's own AI-hair colour, sampled live above
     the brow line -> uniform but still flat, hard-edged, obviously pasted
  c) widened the feather, dropped edge-steepening, capped opacity at 0.55 ->
     marginally softer, still unmistakably a patch

The common failure under all four: masking, blurring and recolouring a
PHOTOGRAPH do not turn it into a PAINTING. A photo has continuous tone,
camera noise and real-world lighting; the art around it has flat colour
bands, painted highlights and a limited palette. No amount of blend math
closes that gap -- it needs the patch to be actually RE-RENDERED in the
page's style (a style-transfer or img2img model call on the segmented hair,
analogous to what the cheap-filter approach was tried as a free substitute
for), which is a materially bigger piece of work than anything here. Left
disabled (`real_hair_transplant_enabled = False`) until someone picks that up
-- the segmentation/anchoring/warm/gate plumbing in this file is sound and
reusable, only `_stylize_hair_patch` needs replacing, not the pipeline
around it.
"""
from __future__ import annotations

import asyncio
import io
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

from .config import settings

# Past this many degrees of relative head roll between the photo and the
# page, a similarity warp starts shearing the hair's silhouette visibly --
# measured by eye on a few rotated test crops, not a tuned threshold yet.
MAX_ROLL_DIFF_DEG = 18.0

# How far outside the segmented hair's own edge to feather the composite, as
# a fraction of the anchor span (eye-to-eye distance).
#
# Wider than a typical face-region feather on purpose, and NOT steepened
# afterward (see PATCH_OPACITY below): earlier attempts used the same hard,
# steepened edge `_region_mask`/`_keep_artwork_hair` use for a FACE swap --
# right there, because skin blends and hair doesn't, a crisp edge is correct.
# Here the patch itself is photographic content next to painted art, so even
# a perfectly placed, perfectly coloured patch reads as "pasted" at a crisp
# edge. Measured on a real render: steepened to a hard edge, it looked like a
# sticker; wide and soft, the same patch reads more like a tint.
FEATHER_PX_PER_SPAN = 0.45

# The composited patch is blended at PARTIAL opacity over the AI-generated
# hair rather than fully replacing it, multiplied into the mask after
# feathering. Full replacement is what produced a flat, obviously-photographic
# patch in every earlier attempt regardless of colour-matching -- showing
# THROUGH the AI hair rather than covering it keeps some of the painted
# hair's own texture and shading visible underneath, closer to "this photo
# influenced the hair" than "a photo is stuck on the page".
PATCH_OPACITY = 0.55

# Gender-neutral: unlike sam3.py's plate tracing, this runs on `_b64_face`'s
# already-tight crop of a single child's face, where there is nothing else in
# frame to confuse "the child's hair" with -- no gendered wording needed and
# no gender is threaded through the faceswap call chain to supply one.
HAIR_PROMPT = "the child's hair only, human hair, not skin not background"

# Edge-preserving smoothing radius/sigma for stripping photographic texture
# (individual strands, camera noise, motion blur) while keeping the hair's
# own shading bands -- cv2.bilateralFilter params, not a Gaussian: a Gaussian
# blurs the silhouette's internal light/dark bands into mud, which reads as
# "out of focus", not "painted". Bilateral keeps those bands crisp while
# killing strand-level texture, closer to how a flat illustration shades hair
# in a few bands rather than thousands of individual strokes.
STYLIZE_BILATERAL_D = 15
STYLIZE_BILATERAL_SIGMA_COLOR = 60
STYLIZE_BILATERAL_SIGMA_SPACE = 60

# Sample box for the AI-drawn hair's own colour, as a box directly above the
# brow line in units of eye-span -- the same band `_keep_template_hair` in
# generation_engine.py treats as "definitely hair, not forehead": centred
# above the midpoint between the eyes, tall enough to clear a fringe without
# reaching the scalp's crown highlight, which reads brighter than the hair's
# base colour and would skew the sample pale.
PAGE_HAIR_SAMPLE_Y_ABOVE_BROW = 0.35   # x span, how far above the brow line
PAGE_HAIR_SAMPLE_HEIGHT = 0.22         # x span, box height
PAGE_HAIR_SAMPLE_WIDTH = 0.5           # x span, box width, centred on the eyes


def _sample_page_hair_color(page_bytes: bytes):
    """The AI-drawn hair's own hue/saturation from THIS page, as HSV floats in
    [0,255], or None.

    A generic "boost saturation" pass pushes whatever hue a real photo's hair
    already has, which is wrong when that hue is cool/grey to begin with --
    measured on a real render, it turned flat grey into blotchy teal. What the
    composite actually needs is this specific page's painted hair colour, not
    a bigger number: the page the real hair is about to sit on already has an
    AI-generated reference an inch away, drawn in this book's exact art style
    and palette.
    """
    import cv2
    import numpy as np
    from . import face_landmarks as fl

    found = fl._landmarks(page_bytes)  # noqa: SLF001 -- reuse the already-loaded mesh
    if not found:
        return None
    lm, W, H, span = found
    brow_y = min(lm[fl.BROW_L].y, lm[fl.BROW_R].y) * H
    cx = (lm[fl.EYE_OUTER_L].x + lm[fl.EYE_OUTER_R].x) / 2.0 * W

    box_h = span * PAGE_HAIR_SAMPLE_HEIGHT
    box_w = span * PAGE_HAIR_SAMPLE_WIDTH
    top = brow_y - span * PAGE_HAIR_SAMPLE_Y_ABOVE_BROW - box_h
    left = cx - box_w / 2.0

    page_arr = np.asarray(Image.open(io.BytesIO(page_bytes)).convert("RGB"))
    y0, y1 = max(0, int(top)), min(H, int(top + box_h))
    x0, x1 = max(0, int(left)), min(W, int(left + box_w))
    if y1 <= y0 or x1 <= x0:
        return None
    sample = page_arr[y0:y1, x0:x1]
    hsv = cv2.cvtColor(sample, cv2.COLOR_RGB2HSV).astype(np.float32)
    return {
        "h": float(np.median(hsv[:, :, 0])),
        "s": float(np.median(hsv[:, :, 1])),
    }


def _stylize_hair_patch(rgb_bytes_arr, mask_bool, target_hs: Optional[dict] = None):
    """Flatten a real photo's hair toward the painted art's look, in place on
    the pixels INSIDE `mask_bool` only -- skin, background and clothing in the
    same crop are left untouched since they are never composited anyway, but
    touching them would waste time and risks the bilateral filter sampling
    hair-coloured pixels across the mask boundary.

    Takes and returns a numpy uint8 HxWx3 array (RGB), to run once on the
    photo before the warp -- doing it before rather than after keeps the
    stylization in the photo's own un-warped pixel grid, so the bilateral
    filter's radius means the same thing regardless of what scale the warp
    will later apply.

    `target_hs` is {"h","s"} sampled from the PAGE's own AI-drawn hair, via
    `_sample_page_hair_color`. When given, hue and saturation are REPLACED
    with that page's actual painted hair colour rather than pushed by a fixed
    multiplier -- a generic saturation boost amplifies whatever hue the photo
    already has, which looked blotchy and teal on a real photo whose hair
    read cool/grey under its own lighting. Replacing hue/sat outright and
    keeping only VALUE (the photo's own light/dark shading) is what actually
    makes "this photo's hair" read as "this page's hair colour, this photo's
    shape and shading" instead of a re-tinted photograph.
    """
    import cv2
    import numpy as np

    out = rgb_bytes_arr.copy()
    smoothed = cv2.bilateralFilter(
        rgb_bytes_arr,
        STYLIZE_BILATERAL_D,
        STYLIZE_BILATERAL_SIGMA_COLOR,
        STYLIZE_BILATERAL_SIGMA_SPACE,
    )

    hsv = cv2.cvtColor(smoothed, cv2.COLOR_RGB2HSV).astype(np.float32)
    if target_hs is not None:
        hsv[:, :, 0] = target_hs["h"]
        hsv[:, :, 1] = target_hs["s"]
    styled = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    out[mask_bool] = styled[mask_bool]
    return out


def real_hair_enabled() -> bool:
    return bool(settings.real_hair_transplant_enabled)


async def segment_source_hair(photo_bytes: bytes) -> Optional[bytes]:
    """Hair-only mask for a REAL PHOTO crop, as raw mask bytes, or None.

    Reuses SAM3 (already paid for and wired in for plate autotrace) pointed at
    the source photo instead of the illustrated page. Open-vocabulary, so the
    wording matters the same way it does in sam3.py: naming the child and
    excluding skin/background keeps it off the collar, the wall, the photo's
    own shadows.
    """
    import base64
    import httpx

    from .generation_engine import current_segmind_key
    from .sam3 import SAM3_URL

    api_key = current_segmind_key()
    if not api_key:
        return None

    payload = {
        "image": base64.b64encode(photo_bytes).decode(),
        "text_prompt": HAIR_PROMPT,
        "return_preview": True,
        "return_masks": False,
        "return_overlay": False,
        "threshold": 0.5,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(420.0, connect=20.0)) as client:
            r = await client.post(
                SAM3_URL,
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )
            if r.status_code != 200:
                print(f"[hair-transplant] SAM3 {r.status_code}: {(r.text or '')[:200]}", flush=True)
                return None
            return r.content
    except Exception as e:  # noqa: BLE001 -- a missing real-hair patch falls back to the AI's
        print(f"[hair-transplant] SAM3 call failed: {e}", flush=True)
        return None


def _mask_bytes_to_image(mask_bytes: bytes) -> Optional[Image.Image]:
    import cv2
    import numpy as np

    buf = np.frombuffer(mask_bytes, dtype=np.uint8)
    arr = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    if arr is None:
        return None
    _, binary = cv2.threshold(arr, 127, 255, cv2.THRESH_BINARY)
    return Image.fromarray(binary, "L")


def _anchor(image_bytes: bytes) -> Optional[dict]:
    """Eye-corner anchor points + roll angle, in PIXELS, for a photo or a page.

    `face_landmarks` runs mediapipe at a confidence low enough to find drawn
    faces too (its own docstring: 0.3 found every illustrated plate tested),
    so the same function anchors both the real photo and the generated page.
    """
    from . import face_landmarks as fl

    try:
        found = fl._landmarks(image_bytes)  # noqa: SLF001 -- same module, no public wrapper exists yet
    except Exception as e:  # noqa: BLE001
        print(f"[hair-transplant] landmark lookup failed: {e}", flush=True)
        return None
    if not found:
        return None
    lm, W, H, span = found
    lx, ly = lm[fl.EYE_OUTER_L].x * W, lm[fl.EYE_OUTER_L].y * H
    rx, ry = lm[fl.EYE_OUTER_R].x * W, lm[fl.EYE_OUTER_R].y * H
    import math

    roll = math.degrees(math.atan2(ry - ly, rx - lx))
    return {
        "left": (lx, ly),
        "right": (rx, ry),
        "span": span,
        "roll": roll,
        "center": ((lx + rx) / 2.0, (ly + ry) / 2.0),
    }


def _similarity_warp(
    hair_rgba: Image.Image, src_anchor: dict, dst_anchor: dict, dst_size: tuple[int, int]
) -> Optional[Image.Image]:
    """Scale + rotate + translate `hair_rgba` (in photo pixel space) into a
    canvas the size of the page, so the photo's hair lands where the page's
    face sits, at the page's face scale.

    A similarity transform, not a full affine/perspective one: two
    corresponding points (the eye corners) fix scale, rotation and
    translation exactly and are all `face_landmarks` reliably gives on both a
    photo and a drawn face. A third or fourth point would let the hair also
    shear to match perspective, but a bad third point (landmarks are noisier
    on illustrated art than on photos) would warp the silhouette rather than
    just mis-size it -- the safer failure here is "slightly wrong scale", not
    "sheared into a smear".

    LINEAR, not LANCZOS4: measured on a real crop, Lanczos's overshoot on the
    mask's hard 0/255 edge didn't just ring at the border -- it tore the
    silhouette into a blocky wrong shape, because the same ringing happens in
    EVERY channel including alpha, and a negative lobe clamped back to 0/255
    turns "slightly soft edge" into "alpha says a square of forehead/shirt is
    hair". Linear has no overshoot, at the cost of a slightly softer silhouette
    that the feather step blurs further anyway.

    RGB is premultiplied by alpha before warping and un-premultiplied after:
    without it, linear interpolation at the mask's edge averages real hair
    colour with the (0,0,0) RGB sitting UNDER fully-transparent pixels --
    measured, a hair pixel one step from the mask boundary came back light
    blue-grey instead of dark brown, which is a straight average of near-black
    hair and the (0,0,0) padding colour weighted by how transparent its
    neighbour was. Premultiplying makes that neighbour's contribution zero
    instead of "black at full RGB weight".
    """
    import numpy as np
    import cv2

    scale = dst_anchor["span"] / max(1e-6, src_anchor["span"])
    angle = dst_anchor["roll"] - src_anchor["roll"]

    src_arr = np.array(hair_rgba).astype(np.float32)
    alpha = src_arr[:, :, 3:4] / 255.0
    premult = src_arr.copy()
    premult[:, :, :3] *= alpha  # RGB * alpha, so transparent pixels carry no colour weight

    M = cv2.getRotationMatrix2D(src_anchor["center"], -angle, scale)
    # Translate so the source anchor's centre lands on the destination's.
    M[0, 2] += dst_anchor["center"][0] - src_anchor["center"][0]
    M[1, 2] += dst_anchor["center"][1] - src_anchor["center"][1]

    warped = cv2.warpAffine(
        premult,
        M,
        dst_size,
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    out_alpha = np.clip(warped[:, :, 3:4], 0.0, 255.0)
    safe_alpha = np.maximum(out_alpha, 1e-3)
    out_rgb = np.clip(warped[:, :, :3] / (safe_alpha / 255.0), 0.0, 255.0)
    out = np.concatenate([out_rgb, out_alpha], axis=2).astype("uint8")
    return Image.fromarray(out, "RGBA")


def _feather_and_cap_opacity(alpha: Image.Image, span_px: float) -> Image.Image:
    """Wide, un-steepened blur, then capped at `PATCH_OPACITY` -- see the
    constants' own comments for why this patch wants a soft tint rather than
    a crisp replacement."""
    import numpy as np

    blur = max(4.0, span_px * FEATHER_PX_PER_SPAN * 0.5)
    soft = alpha.filter(ImageFilter.GaussianBlur(blur))
    arr = np.asarray(soft, dtype=np.float32) / 255.0
    arr = np.clip(arr * PATCH_OPACITY, 0.0, 1.0)
    return Image.fromarray((arr * 255.0).astype("uint8"), "L")


async def paste_real_hair(page_bytes: bytes, photo_bytes: bytes) -> bytes:
    """Return `page_bytes` with the child's own hair composited in, or
    `page_bytes` unchanged if segmentation, landmarks, or the angle gate fail
    -- this is an enhancement over the AI-generated hair, never a requirement
    a page can fail on.
    """
    from .color import open_srgb

    try:
        page_anchor = _anchor(page_bytes)
        photo_anchor = _anchor(photo_bytes)
        if not page_anchor or not photo_anchor:
            print("[hair-transplant] no landmarks on photo or page; keeping generated hair", flush=True)
            return page_bytes

        roll_diff = abs(page_anchor["roll"] - photo_anchor["roll"])
        if roll_diff > MAX_ROLL_DIFF_DEG:
            print(
                f"[hair-transplant] angle mismatch {roll_diff:.1f}deg > "
                f"{MAX_ROLL_DIFF_DEG}deg; keeping generated hair",
                flush=True,
            )
            return page_bytes

        mask_bytes = await segment_source_hair(photo_bytes)
        if not mask_bytes:
            return page_bytes
        hair_mask = _mask_bytes_to_image(mask_bytes)
        if hair_mask is None:
            return page_bytes

        photo_img = open_srgb(photo_bytes).convert("RGB")
        if hair_mask.size != photo_img.size:
            hair_mask = hair_mask.resize(photo_img.size, Image.NEAREST)

        import numpy as np

        photo_arr = np.asarray(photo_img)
        mask_bool = np.asarray(hair_mask) > 127
        target_hs = None
        try:
            target_hs = _sample_page_hair_color(page_bytes)
        except Exception as ce:  # noqa: BLE001 -- falls back to no recolour below
            print(f"[hair-transplant] page hair colour sample skipped: {ce}", flush=True)
        try:
            photo_arr = _stylize_hair_patch(photo_arr, mask_bool, target_hs)
        except Exception as se:  # noqa: BLE001 -- real-but-photographic beats no hair at all
            print(f"[hair-transplant] stylize skipped: {se}", flush=True)
        photo_img = Image.fromarray(photo_arr, "RGB")

        hair_rgba = Image.merge(
            "RGBA", (*photo_img.split(), hair_mask)
        )

        page_img = open_srgb(page_bytes).convert("RGB")
        warped = _similarity_warp(hair_rgba, photo_anchor, page_anchor, page_img.size)
        if warped is None:
            return page_bytes

        alpha = warped.split()[-1]
        if alpha.getbbox() is None:
            print("[hair-transplant] warped hair mask empty; keeping generated hair", flush=True)
            return page_bytes

        alpha = _feather_and_cap_opacity(alpha, page_anchor["span"])

        out = page_img.copy()
        out.paste(warped.convert("RGB"), (0, 0), alpha)

        import io

        buf = io.BytesIO()
        out.save(buf, format="JPEG", quality=95, subsampling=0)
        print("[hair-transplant] real hair composited onto page", flush=True)
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 -- never worth a failed page
        print(f"[hair-transplant] skipped: {e}", flush=True)
        return page_bytes
