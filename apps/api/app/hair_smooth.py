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
# FLUX.1 Fill: a purpose-built inpainting model, same provider (Segmind) already
# paying for the per-page face swap, so a plate repaint needs no second API key.
# Mask convention is the OPPOSITE of OpenAI's: black=preserve, white=repaint.
SEGMIND_FILL_URL = "https://api.segmind.com/v1/flux-fill-dev"

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

PROMPT = (
    "Repaint this hair with the SAME outline and size: soft, smooth, neatly "
    "combed strands with gentle highlights. Remove the speckled white dots and "
    "the spiky bristle tips. Do not enlarge the hair or change its shape. Same "
    "colour, same lighting, same painted children's-book style."
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
    return cv2.GaussianBlur(sel, (0, 0), 8)


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
    """{"image": PIL.Image} or {"error": "..."}. Segmind FLUX Fill: grayscale
    mask, OPPOSITE convention from OpenAI -- black=preserve, white=repaint, so
    the hair-is-255 mask this module already builds is sent as-is, unlike the
    OpenAI path which has to invert it into an alpha channel."""
    cb, mb = io.BytesIO(), io.BytesIO()
    crop.save(cb, format="PNG")
    Image.fromarray(mask).save(mb, format="PNG")

    try:
        r = httpx.post(
            SEGMIND_FILL_URL,
            headers={"x-api-key": api_key},
            json={
                "image": base64.b64encode(cb.getvalue()).decode(),
                "mask": base64.b64encode(mb.getvalue()).decode(),
                "prompt": PROMPT,
                "num_inference_steps": 30,
                "guidance": 30,
                "output_format": "png",
                "megapixels": "1",
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

    side = int(min(fw * HEAD_CROP / 100 * W, W, H))
    if side < 64:
        return {"error": "face region too small to repaint around"}
    cx = int((fx + fw / 2) / 100 * W)
    cy = int((fy - fh * 0.10) / 100 * H)
    x0 = min(max(0, cx - side // 2), W - side)
    y0 = min(max(0, cy - side // 2), H - side)

    crop = plate.crop((x0, y0, x0 + side, y0 + side)).resize((1024, 1024), Image.LANCZOS)
    scale = 1024.0 / side
    mask = _hair_mask(crop, (fy / 100 * H - y0) * scale, (cx - x0) * scale)
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
