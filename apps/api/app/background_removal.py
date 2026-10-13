"""Strip the room out of an uploaded photo, leaving the child on a plain
white fill.

Why this exists
----------------
The photo Segmind is handed is a room with a child in it, not just a face --
`_face_crop_bytes`'s own docstring documents the same problem one level up
(too little of the child in frame). The crop fixes scale; this fixes content:
whatever bed, wardrobe or window sits at the crop's edge is still real pixels
the swapper can read as hair, skin or clothing texture it wasn't asked for.
A plain fill removes that ambiguity at the source instead of trying to
correct for it after the swap, the way `_remove_skin_specks` and
`_even_skin_shading` already have to.

Approach
--------
`rembg` (ONNX, runs locally -- no API key, no per-call cost) segments the
foreground subject from the background. The model is u2net, the same one
`rembg` defaults to; it is general-purpose (person/object matting), not
trained specifically on children's portraits, so it is treated as "probably
right, not certainly" -- any failure falls back to the original, untouched
photo rather than risk handing Segmind a bad cutout.

Composited onto plain white rather than left transparent: faceswap-comic
takes a normal flat image, and transparency would either flatten to black
(most JPEG encoders) or carry an alpha channel the API does not expect.
"""
from __future__ import annotations

import io
from functools import lru_cache

from PIL import Image


@lru_cache(maxsize=1)
def _session():
    """One rembg session, built on first use. Loading the model costs ~1-2s;
    the model itself downloads once (see Dockerfile) rather than on first
    request, so that cost does not land on a customer's render.
    """
    from rembg import new_session

    return new_session("u2net")


def remove_background(data: bytes, *, fill=(255, 255, 255)) -> bytes:
    """The subject of `data`, on a plain `fill`-coloured background, as JPEG
    bytes. Returns `data` unchanged if segmentation fails for any reason --
    a photo with its background intact is always safer to send onward than
    one this function got wrong.
    """
    try:
        from rembg import remove

        img = Image.open(io.BytesIO(data))
        img = img.convert("RGBA")
        cut = remove(img, session=_session())  # RGBA, subject opaque, rest transparent

        canvas = Image.new("RGB", cut.size, fill)
        canvas.paste(cut, mask=cut.split()[3])  # alpha channel as the paste mask

        buf = io.BytesIO()
        canvas.save(buf, format="JPEG", quality=95, subsampling=0)
        print("[background] removed, composited onto plain fill", flush=True)
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 -- the original photo beats a failed page
        print(f"[background] removal skipped: {e}", flush=True)
        return data
