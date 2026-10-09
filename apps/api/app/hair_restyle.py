"""Re-render a transplanted hair patch in the page's painted style.

The missing step in `hair_transplant.py`
----------------------------------------
That module cuts the child's real hair out of their photo, warps it onto the
page and composites it, and every stage up to the composite is verified
pixel-correct. Only the last step fails: `_stylize_hair_patch` tries to make a
PHOTOGRAPH look painted with a bilateral blur and a hue/saturation swap, and
after four rounds its author recorded the honest verdict -- "STILL an obvious
flat patch, not illustrated hair" -- and left the whole feature disabled.

The reason is in that note: a photo has continuous tone, camera noise and
real-world lighting; the art around it has flat colour bands, painted
highlights and a limited palette. No blend maths closes that gap. The patch
has to be RE-DRAWN in the page's style, which is what this module does.

Why this is worth the extra call
--------------------------------
Measured on speed-racer, the reason the hair edge reads as see-through is that
the artwork's lit strand tips and the wall behind them are the same colour --
luminance 100 vs 101, Lab within 6 units. Eleven post-process filters were
built against that and none can separate them, because there is nothing to
separate: they are the same pixel values. Generating opaque hair sidesteps the
problem rather than fighting it -- there is no gap to see through.

Where it runs
-------------
AFTER the composite, not before it as the old stylizer did. Two reasons. The
model sees the hair already in position against the page's own background, so
it can match the surrounding art instead of guessing at it; and the mask is in
page space, where the hair's real extent is known, rather than photo space.

Cost: one extra Segmind call per page that gets this far -- roughly 30 per
book. The angle/landmark/segmentation gates in hair_transplant reject most
pages before this point (1 of 4 on a measured run), so the real figure is
lower, but budget for the worst case.

STATUS: built for offline validation. Gated by `real_hair_transplant_enabled`,
which is OFF, so nothing calls it in production until it has been judged on
saved renders across several stories.
"""
from __future__ import annotations

import base64
import io
from typing import Optional

import httpx
from PIL import Image, ImageFilter

SEGMIND_INPAINT_URL = "https://api.segmind.com/v1/sdxl-inpaint"

# Describe the TARGET look, not the defect. hair_smooth.py's prompt asks to
# "blend this edge", which suits a touch-up; here the whole patch is being
# re-drawn, so it needs to say what illustrated hair looks like in this book.
PROMPT = (
    "children's book illustration of a child's hair, painted in smooth opaque "
    "strokes with soft highlights, solid and full with no gaps, matching the "
    "painted style and lighting of the surrounding artwork"
)
NEGATIVE_PROMPT = (
    "photograph, photorealistic, 3d render, see-through hair, transparent, "
    "gaps showing background, wispy straggly strands, white flecks, sparkle, "
    "harsh outline, cutout, sticker, blurry smear, different hairstyle"
)

# How much the model may redraw. Low values leave the photographic texture the
# old stylizer could not remove; high values invent a new hairstyle, which is
# the exact failure of faceswap-comic that this whole feature exists to avoid.
# Start mid and tune on real pages -- hair_smooth.py needed 6+ rounds to land
# its own strength, and that was for a far smaller edit than this.
DEFAULT_STRENGTH = 0.55

# Grown so the model sees a little of the surrounding art and can match into
# it; feathered so the re-drawn patch does not land with a visible boundary.
MASK_GROW_PX = 6
MASK_FEATHER_PX = 3

REQUEST_TIMEOUT = 90.0


def _b64_png(img: Image.Image) -> str:
    """sdxl-inpaint wants BARE base64 -- a data: prefix 400s as 'Invalid
    Image' on this endpoint, though the sibling flux-fill-dev endpoint
    requires one. Learned the hard way in hair_smooth.py; do not 'fix' it."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _prepare_mask(alpha: Image.Image) -> Image.Image:
    """The composite's alpha -> an inpaint mask. Segmind's convention is
    black=preserve, white=repaint, which is the same sense as the alpha, so
    no inversion -- unlike the OpenAI path in hair_smooth.py."""
    grown = alpha.filter(ImageFilter.MaxFilter(MASK_GROW_PX * 2 + 1))
    return grown.filter(ImageFilter.GaussianBlur(MASK_FEATHER_PX)).convert("L")


def restyle_hair(
    page: Image.Image,
    hair_alpha: Image.Image,
    api_key: str,
    strength: float = DEFAULT_STRENGTH,
    timeout: float = REQUEST_TIMEOUT,
) -> dict:
    """Re-draw the masked hair in the page's style.

    Returns {"image": PIL.Image} or {"error": str}. Never raises: the caller
    keeps the un-restyled composite when this fails, exactly as
    hair_transplant keeps the generated hair when a gate rejects a page.
    """
    if not api_key:
        return {"error": "no segmind api key"}
    try:
        mask = _prepare_mask(hair_alpha)
        if mask.getbbox() is None:
            return {"error": "empty hair mask"}

        r = httpx.post(
            SEGMIND_INPAINT_URL,
            headers={"x-api-key": api_key},
            json={
                "image": _b64_png(page.convert("RGB")),
                "mask": _b64_png(mask),
                "prompt": PROMPT,
                "negative_prompt": NEGATIVE_PROMPT,
                "samples": 1,
                "num_inference_steps": 30,
                "guidance_scale": 7.5,
                "strength": strength,
                "scheduler": "DPM2 Karras",
                "base64": False,
            },
            timeout=timeout,
        )
        if r.status_code != 200:
            return {"error": f"segmind {r.status_code}: {(r.text or '')[:200]}"}
        out = Image.open(io.BytesIO(r.content)).convert("RGB")
        if out.size != page.size:
            out = out.resize(page.size, Image.LANCZOS)
        return {"image": out}
    except Exception as e:  # noqa: BLE001 -- a restyle is never worth a failed page
        return {"error": f"{type(e).__name__}: {e}"}


def blend_restyled(
    original: Image.Image, restyled: Image.Image, hair_alpha: Image.Image
) -> Image.Image:
    """Keep the re-drawn pixels only inside the hair, feathered at its edge.

    sdxl-inpaint returns a whole frame, and it is not pixel-identical outside
    the mask -- re-encoding alone shifts the face a little. Pasting through
    the mask means the child's face, the background and the artwork come back
    exactly as they were, and only the hair is new.
    """
    mask = hair_alpha.filter(ImageFilter.GaussianBlur(MASK_FEATHER_PX)).convert("L")
    out = original.copy()
    out.paste(restyled, (0, 0), mask)
    return out
