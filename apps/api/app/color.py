"""RGB -> CMYK conversion for print.

Artwork arrives and is composed in sRGB (that's what the models return, what the
text layer draws in, and what the browser preview needs). The printed book has
to be CMYK, so the conversion happens once, at PDF build time.

Why this module exists instead of a plain `img.convert("CMYK")`: Pillow's
built-in conversion is a naive inversion that ALWAYS produces K=0. Pure black
text comes out as C=255 M=255 Y=255 K=0 — 300% ink, no black plate, so every
letter prints as a three-colour overprint that misregisters into colour fringing
and may exceed the press's total-ink limit.

With an ICC profile (littlecms, bundled with Pillow) the conversion does proper
black generation and honours the profile's ink limits. Point CMYK_ICC_PROFILE at
whatever profile your printer asks for; without one we still generate a black
plate ourselves rather than shipping K=0.
"""
from __future__ import annotations

import io
import os
from functools import lru_cache
from typing import Optional

from PIL import Image, ImageCms

# Your printer's profile takes priority — ask them which one they want.
ENV_VAR = "CMYK_ICC_PROFILE"

# Profiles that ship with common Debian packages (icc-profiles-free, ghostscript).
_CANDIDATES = (
    "/usr/share/color/icc/ghostscript/default_cmyk.icc",
    "/usr/share/color/icc/coated_FOGRA39L_argl.icc",
    "/usr/share/color/icc/ISOcoated_v2_300_eci.icc",
    "/usr/share/ghostscript/iccprofiles/default_cmyk.icc",
)


@lru_cache(maxsize=1)
def cmyk_profile_path() -> Optional[str]:
    """The CMYK profile to convert into, or None if the image has no profile.

    Looked for in order of how deliberate each location is:

      1. CMYK_ICC_PROFILE, an explicit choice
      2. <storage>/icc/*.icc  -- the shared volume, so a printer's own profile
         can be dropped in over scp with no rebuild and no image change
      3. infra/icc/*.icc      -- checked into the repo, if you would rather it
         travel with the code
      4. the usual Debian/ghostscript locations

    Without one, to_cmyk falls back to arithmetic that keeps blacks on the K
    plate but is not colour-accurate -- fine for a proof, not for a press run.
    /health reports which of these happened.
    """
    import glob as _glob

    env = (os.getenv(ENV_VAR) or "").strip()
    if env and os.path.exists(env):
        return env

    from .config import settings

    for pattern in (
        os.path.join(settings.storage_dir, "icc", "*.ic[cm]"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..",
                     "infra", "icc", "*.ic[cm]"),
    ):
        found = sorted(_glob.glob(pattern))
        if found:
            return os.path.abspath(found[0])

    for path in _CANDIDATES:
        if os.path.exists(path):
            return path
    # Ghostscript versions its directory — take the first match if present.
    import glob

    for path in sorted(glob.glob("/usr/share/ghostscript/*/iccprofiles/default_cmyk.icc")):
        return path
    return None


@lru_cache(maxsize=1)
def _transform():
    """Cached sRGB -> CMYK transform, or None when no profile is installed."""
    path = cmyk_profile_path()
    if not path:
        return None
    try:
        return ImageCms.buildTransform(
            ImageCms.createProfile("sRGB"),
            ImageCms.getOpenProfile(path),
            "RGB",
            "CMYK",
            # Perceptual keeps illustration gradients smooth; relative
            # colorimetric would clip them harder.
            renderingIntent=ImageCms.Intent.PERCEPTUAL,
        )
    except Exception:
        return None


def _naive_cmyk(img: Image.Image) -> Image.Image:
    """CMYK with real black generation, for when no ICC profile is available.

    Standard UCR: pull the common component of C/M/Y onto the black plate. Not
    colour-accurate like a profile, but it keeps blacks on the K plate and total
    ink at or below 100% + K instead of Pillow's flat 300%.
    """
    r, g, b = img.convert("RGB").split()
    # K = 255 - max(R, G, B)
    from PIL import ImageChops

    k = ImageChops.invert(ImageChops.lighter(ImageChops.lighter(r, g), b))

    def plate(channel: Image.Image) -> Image.Image:
        # (255 - channel - K) / (255 - K), guarded where K = 255 (pure black).
        inv = ImageChops.invert(channel)
        return ImageChops.subtract(inv, k)

    return Image.merge("CMYK", (plate(r), plate(g), plate(b), k))


def to_srgb(img: Image.Image) -> Image.Image:
    """Any source image -> sRGB, honouring whatever colour space it arrived in.

    Base art is authored for print. The unicorn book's cover plate is a 2482px
    CMYK JPEG carrying a Coated FOGRA39 profile, and Pillow's convert("RGB")
    does not read that profile -- it applies the naive 255-x inversion, which on
    that plate lands 8.7 luminance levels dark and shifts every colour with it.
    Darker, muddier, heavier shadows, on screen and in the preview PDF. That is
    the "images look a little dark" report, and it is also feeding the swapper a
    contrastier face to shade.

    Customer photos benefit for the same reason from the other direction: a
    modern phone tags its JPEGs Display P3, and reading those as sRGB oversaturates
    them.

    No profile and already RGB means there is nothing to do and nothing is done.
    """
    icc = img.info.get("icc_profile")
    if img.mode == "RGB" and not icc:
        return img
    if icc:
        try:
            return ImageCms.profileToProfile(
                img,
                ImageCms.getOpenProfile(io.BytesIO(icc)),
                ImageCms.createProfile("sRGB"),
                renderingIntent=ImageCms.Intent.PERCEPTUAL,
                outputMode="RGB",
            )
        except Exception as e:  # noqa: BLE001 -- a bad profile is not a dead render
            print(f"[color] icc->srgb failed, using naive convert: {e}", flush=True)
    return img.convert("RGB")


def open_srgb(data) -> Image.Image:
    """Open bytes / a path / a file object and return it in sRGB."""
    if isinstance(data, (bytes, bytearray)):
        data = io.BytesIO(data)
    return to_srgb(Image.open(data))


def to_cmyk(img: Image.Image) -> Image.Image:
    """Convert an RGB page to CMYK for print."""
    if img.mode == "CMYK":
        return img
    rgb = img.convert("RGB")
    tf = _transform()
    if tf is not None:
        try:
            return ImageCms.applyTransform(rgb, tf)
        except Exception:
            pass
    return _naive_cmyk(rgb)


def profile_bytes() -> Optional[bytes]:
    """Raw ICC bytes of the output profile, for embedding alongside the PDF."""
    path = cmyk_profile_path()
    if not path:
        return None
    try:
        with open(path, "rb") as f:
            return f.read()
    except Exception:
        return None


def describe() -> dict:
    """What the colour pipeline is actually doing — surfaced on /health."""
    path = cmyk_profile_path()
    return {
        "cmykProfile": os.path.basename(path) if path else None,
        "cmykProfilePath": path,
        "colorManaged": _transform() is not None,
    }
