"""Repaint a plate's hair smoothly, once, at AUTHORING time.

Why here and not in the render
------------------------------
The spiky, speckled hair is drawn into the plate -- measured on speed-racer p3,
the plate carries 3.63% bright specks and the finished render 3.00%, so the
pipeline is reproducing the artwork faithfully and there is nothing in the swap
to correct. The fix has to change the artwork.

Three cheaper attempts failed first, and are worth recording so nobody repeats
them: extending the traced outline over the hair makes the swapper invent hair
against a background it cannot see (a pale halo at 70%, grey smudges on the
skin when fitted to the measured hairline); and removing the dots as bright
specks takes out a quarter of them, costs real strand detail, and is the same
technique that twice erased a child's eye.

So the hair is repainted by an image model that understands "smooth hair",
masked to the hair alone, and the result is stored as the plate. Once per page,
not once per render: a render-time call would add ~25s and a charge to every
page of every customer's book, for a plate that never changes.
"""
from __future__ import annotations

import base64
import io

import httpx
from PIL import Image

OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits"
# SDXL inpaint: same provider (Segmind) already paying for the per-page face
# swap, so a plate repaint needs no second API key. Mask convention is the
# OPPOSITE of OpenAI's: black=preserve, white=repaint.
#
# flux-fill-dev was tried first (newer model, matches the rest of this
# project's FLUX usage) but its endpoint wants a `version` field this account
# doesn't have -- it 406s with "none is not an allowed value", the shape of a
# Replicate-style versioned-prediction wrapper around a community model, not
# a flat synchronous call. sdxl-inpaint is the plain, documented shape this
# module actually needs; nothing here depends on which model draws the hair.
SEGMIND_FILL_URL = "https://api.segmind.com/v1/sdxl-inpaint"

# The square sent to the editor, as a multiple of the face region's width. Wide
# enough to hold the whole head with room around it, so the model sees where the
# hair ends rather than having to guess at a cropped edge.
HEAD_CROP = 2.0

# Hair is dark AND warm; the plates put heads against backgrounds that are often
# just as dark (a blue wall, a dim garage) and the first version selected those
# instead -- a black rectangle pasted over the scene. b* above neutral is what
# separates brown hair from blue wall.
HAIR_LUMA_PCT = 70      # darker than this percentile within the crop
HAIR_WARM_MIN = 126     # Lab b* above neutral

# The hair MASS is dark; the illustrator's flyaway-strand highlights at its
# edge are drawn pale -- the opposite colour, so the dark/warm test above
# cannot find them, and they sit outside whatever blob it does find. A
# targeted pale/local-background test found them precisely (confirmed by
# eye against speed-racer p1: the detected pixels traced the jagged crown
# fringe exactly) but the mask's own MORPH_CLOSE afterward smoothed thin,
# scattered strand pixels back out almost to the original blob -- a closing
# kernel wide enough to bridge real gaps in the hair mass is, by the same
# token, wide enough to erase a few-pixel-wide addition at the edge.
# Growing the whole mask outward by a flat margin is cruder but immune to
# that: it always reaches the fringe band regardless of exactly which
# pixels in it got classified as hair, and the inpaint prompt's "SAME
# outline and size" instruction keeps the repaint from visibly enlarging
# the hair even though the MASK is a little bigger than the hair mass.
# Two whole-hair attempts (grow the mass outward by a margin, repaint
# everything inside it) both failed, in opposite directions: strength 0.9
# fixed the fringe but let the model redesign the hairstyle (short choppy
# cut came back as a tall swept-back puff); strength 0.45 kept the shape
# but barely touched the fringe, since so little of the original pixels
# were allowed to change. One dial can't satisfy both at once when the
# model can see -- and so can repaint -- the whole hairstyle.
#
# So don't show it the whole hairstyle. The mask is now a THIN RING
# straddling only the edge itself -- dilate the hair mass out a little,
# erode it in a little, keep the band between. Everything inside that
# band's inner edge (the actual hair) and everything outside its outer
# edge (the background) is locked, identical pixel for pixel; the model
# only ever sees a seam with hair-colour on one side and background-colour
# on the other, which is a much narrower task than "paint a hairstyle" and
# can run at a high strength without room to invent a new shape.
RING_OUTER_GROW_PX = 29  # at 1024px wide. 21 left a faint residual pale
# line; 33 (at strength 0.95) gave a visible green/olive tint and blur.
# 26+0.88 cleared the TOP edge but left the LEFT side pale plus a new
# orange artifact blob -- isolating the two knobs: width back up a touch,
# strength back down to the known-safe 0.85, to see which one owns which
# failure mode before moving either further.
RING_INNER_SHRINK_PX = 9  # how far in; together these set the ring's width

PROMPT = (
    "Blend this edge seamlessly: dark hair strands fading cleanly into the "
    "background behind them. No pale highlights, no white flecks or dots, "
    "no visible boundary line -- just a clean, soft edge where individual "
    "strands meet open space, in the same painted children's-book style."
)
NEGATIVE_PROMPT = (
    "white halo, pale glow, bright outline, speckled dots, sparkle, hard "
    "edge, cutout, sticker, photorealistic, 3d render, blurry smear"
)


def _hair_mask(crop: Image.Image, brow_y: float, head_x: float):
    """The hair blob in `crop`: dark, warm, above the brow, attached to the head.

    Returns a feathered 0-255 mask, or None when no plausible hair is found --
    a page where the child wears a helmet, or is too small in frame, must be
    left alone rather than guessed at.
    """
    import cv2
    import numpy as np

    arr = np.asarray(crop.convert("RGB"))
    lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)
    L = lab[..., 0].astype(np.float32)
    B = lab[..., 2].astype(np.float32)

    hair = ((L < np.percentile(L, HAIR_LUMA_PCT)) & (B > HAIR_WARM_MIN)).astype("uint8")
    cut = int(max(0, brow_y))
    hair[cut:, :] = 0  # never below the brow: that is forehead, eyes, skin

    n, labels, stats, cent = cv2.connectedComponentsWithStats(hair, 8)
    best, best_score = 0, -1.0
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 2000:
            continue
        # Big AND near the head's centre line -- the largest dark blob on a busy
        # plate is often a shelf or a doorway, not the child's hair.
        score = area - abs(cent[i][0] - head_x) * 40
        if score > best_score:
            best, best_score = i, score
    if not best:
        return None

    sel = ((labels == best).astype("uint8")) * 255
    sel = cv2.morphologyEx(sel, cv2.MORPH_CLOSE, np.ones((35, 35), "uint8"))

    # The ring: dilate out, erode in, keep the band between. Everything
    # inside the eroded shape (the hair interior) and everything outside
    # the dilated shape (the background) is cut back to 0 -- locked.
    outer_k = max(1, RING_OUTER_GROW_PX) | 1
    inner_k = max(1, RING_INNER_SHRINK_PX) | 1
    outer = cv2.dilate(sel, np.ones((outer_k, outer_k), "uint8"))
    inner = cv2.erode(sel, np.ones((inner_k, inner_k), "uint8"))
    ring = cv2.subtract(outer, inner)
    ring[cut:, :] = 0  # never below the brow

    return cv2.GaussianBlur(ring, (0, 0), 4)


def _edit_openai(crop: Image.Image, mask, api_key: str, timeout: float) -> dict:
    """{"image": PIL.Image} or {"error": "..."}. OpenAI edits: alpha channel,
    transparent = repaint."""
    import numpy as np

    rgba = np.zeros((1024, 1024, 4), "uint8")
    rgba[..., 3] = 255 - mask
    cb, mb = io.BytesIO(), io.BytesIO()
    crop.save(cb, format="PNG")
    Image.fromarray(rgba).save(mb, format="PNG")

    try:
        r = httpx.post(
            OPENAI_EDITS_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data={
                "model": "gpt-image-1",
                "prompt": PROMPT,
                "size": "1024x1024",
                "input_fidelity": "high",
                "quality": "high",
            },
            files={
                "image": ("plate.png", cb.getvalue(), "image/png"),
                "mask": ("mask.png", mb.getvalue(), "image/png"),
            },
            timeout=httpx.Timeout(timeout, connect=20.0),
        )
    except httpx.HTTPError as e:
        return {"error": f"could not reach OpenAI: {type(e).__name__}"}
    if r.status_code != 200:
        return {"error": f"OpenAI {r.status_code}: {' '.join(r.text.split())[:200]}"}
    img = Image.open(
        io.BytesIO(base64.b64decode(r.json()["data"][0]["b64_json"]))
    ).convert("RGB")
    return {"image": img}


def _edit_segmind(crop: Image.Image, mask, api_key: str, timeout: float) -> dict:
    """{"image": PIL.Image} or {"error": "..."}. Segmind SDXL inpaint:
    grayscale mask, OPPOSITE convention from OpenAI -- black=preserve,
    white=repaint, so the hair-is-255 mask this module already builds is
    sent as-is, unlike the OpenAI path which has to invert it into an
    alpha channel."""
    cb, mb = io.BytesIO(), io.BytesIO()
    crop.save(cb, format="PNG")
    Image.fromarray(mask).save(mb, format="PNG")

    # sdxl-inpaint takes bare base64 (unlike flux-fill-dev's `uri`-format
    # field, which 400'd on this same bare string and needed a data: prefix
    # instead) -- the data: prefix on THIS endpoint instead 400'd as
    # "Invalid Image", so the two Segmind endpoints disagree on the encoding
    # despite both calling it "image"/"mask".
    image_uri = base64.b64encode(cb.getvalue()).decode()
    mask_uri = base64.b64encode(mb.getvalue()).decode()

    try:
        r = httpx.post(
            SEGMIND_FILL_URL,
            headers={"x-api-key": api_key},
            json={
                "image": image_uri,
                "mask": mask_uri,
                "prompt": PROMPT,
                "negative_prompt": NEGATIVE_PROMPT,
                "samples": 1,
                "num_inference_steps": 30,
                "guidance_scale": 7.5,
                # Whole-hair masks needed a compromise strength because the
                # model could see (and reshape) the whole hairstyle. Back to
                # the known-safe 0.85 while the ring width is varied, to
                # isolate which knob causes which failure.
                "strength": 0.85,
                "scheduler": "DPM2 Karras",
                "base64": False,
            },
            timeout=httpx.Timeout(timeout, connect=20.0),
        )
    except httpx.HTTPError as e:
        return {"error": f"could not reach Segmind: {type(e).__name__}"}
    if r.status_code != 200:
        return {"error": f"Segmind {r.status_code}: {' '.join(r.text.split())[:200]}"[:300]}
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    return {"image": img}


def smooth_hair(
    plate_bytes: bytes,
    region: dict,
    api_key: str,
    timeout: float = 300.0,
    provider: str = "openai",
) -> dict:
    """Return {"image": bytes} with the hair repainted, or {"error": "..."}.

    `region` is the page's face region (traced polygon or box) in PERCENT --
    the same one the renderer uses, so the hair is found relative to the face
    rather than to the page.

    `provider` is "openai" (gpt-image-1 edits, needs OPENAI_API_KEY) or
    "segmind" (FLUX Fill, needs SEGMIND_API_KEY -- the same key already paying
    for every page's face swap, so no second provider account is needed).
    """
    import cv2
    import numpy as np

    from .color import open_srgb
    from .generation_engine import _region_bounds_pct

    bounds = _region_bounds_pct(region or {})
    if not bounds:
        return {"error": "this page has no face region to find the hair from"}

    plate = open_srgb(plate_bytes).convert("RGB")
    W, H = plate.size
    fx, fy, fw, fh = bounds

    # HEIGHT, not width, measures the head: a region traced brow-to-chin (or
    # hairline-to-chin) tracks head size whatever the pose, but WIDTH swings
    # with how far the shoulders/arms spread -- on a sitting pose it can run
    # past half the page, which used to make `side` cover nearly the whole
    # plate and crop the actual hair down to a few stray pixels. Measured on
    # speed-racer p1: fw=51.3% (shoulders included) vs fh=34.9% (brow to
    # chin) -- using fw put brow_y at just 78px into a 1024px crop, leaving
    # almost nothing above it for `_hair_mask` to find.
    span_pct = min(fh, fw) if fw < fh * 1.5 else fh
    side = int(min(span_pct * HEAD_CROP / 100 * W, W, H))
    if side < 64:
        return {"error": "face region too small to repaint around"}
    cx = int((fx + fw / 2) / 100 * W)
    cy = int((fy - fh * 0.10) / 100 * H)
    x0 = min(max(0, cx - side // 2), W - side)
    y0 = min(max(0, cy - side // 2), H - side)

    crop = plate.crop((x0, y0, x0 + side, y0 + side)).resize((1024, 1024), Image.LANCZOS)
    scale = 1024.0 / side

    # Where the brow sits is the one thing `region` cannot tell us reliably:
    # a face-only outline starts AT the brow, a hair-inclusive one starts at
    # the hairline, and treating the second as the first put brow_y a few
    # dozen pixels into a 1024px crop -- `_hair_mask` then had almost
    # nothing above it to call hair. Detect it on the crop itself, the same
    # landmark pass the render path already uses for this exact question;
    # fall back to the region's own top edge only if that fails.
    try:
        from .face_landmarks import brow_line as _brow_line

        cb = io.BytesIO()
        crop.save(cb, format="JPEG", quality=90)
        brow = _brow_line(cb.getvalue())
        brow_y = brow["y"] if brow else (fy / 100 * H - y0) * scale
    except Exception:
        brow_y = (fy / 100 * H - y0) * scale

    mask = _hair_mask(crop, brow_y, (cx - x0) * scale)
    if mask is None:
        return {"error": "no hair found above the face on this page"}

    editor = _edit_segmind if provider == "segmind" else _edit_openai
    out = editor(crop, mask, api_key, timeout)
    if out.get("error"):
        return out
    edited = out["image"].resize((side, side), Image.LANCZOS)

    # Paste back through the same mask: everything outside the hair is the
    # plate's own pixels, so the face, the scene and the page size are untouched.
    full = np.array(plate).astype(np.float32)
    alpha = (cv2.resize(mask, (side, side)).astype(np.float32) / 255.0)[..., None]
    patch = np.array(edited).astype(np.float32)
    full[y0:y0 + side, x0:x0 + side] = (
        full[y0:y0 + side, x0:x0 + side] * (1 - alpha) + patch * alpha
    )

    buf = io.BytesIO()
    Image.fromarray(np.clip(full, 0, 255).astype("uint8")).save(
        buf, format="JPEG", quality=95, subsampling=0
    )
    return {"image": buf.getvalue(), "changed_pct": float((mask > 128).mean() * 100)}
