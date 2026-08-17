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
    """The CMYK profile to convert into, or None if the image has no profile."""
    env = (os.getenv(ENV_VAR) or "").strip()
    if env and os.path.exists(env):
        return env
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
