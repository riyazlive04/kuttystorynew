"""Admin-toggleable runtime settings, persisted as a small JSON file on the
shared storage volume so both the API and the Celery worker read the same value
(no DB migration needed).

Currently holds:
- faceOutlineEnabled: master switch for the "trace the face outline" hair-keeping
  feature. When False, the swap replaces the whole head everywhere (outlines are
  ignored) and the editor hides the tracing UI.
- whatsappNumber: the business number behind the site's chat button. Held here
  rather than in NEXT_PUBLIC_WHATSAPP so changing it doesn't need a web rebuild.
- keepTemplateAboveBrows: whose hair a finished page shows. The swapper returns
  the child's own hair; above the brow line we can keep the illustrated
  character's instead. Here rather than in env so it can be compared on real
  books without a redeploy.
- imageProvider: which service personalizes the child's face onto a page's base
  art — "segmind" (FaceSwap-Comic) or "openai" (gpt-image-1 face-crop edit). Lives
  here rather than in env so an admin can A/B the two without a redeploy, and so
  the API and the Celery worker always agree on the active provider mid-job.
- segmindRawOutput: show Segmind's swap exactly as it comes back. Skips every
  step after the call -- the face-oval composite, the hair guards, the skin
  retouches and the re-seat into the full-resolution plate. The story text is
  still set on top. Off by default: the post-processing is the current pipeline.
- segmindHairMask: send Segmind a mask of the face -- the traced outline minus
  the illustration's own hair -- so the swap repaints only the face and the
  illustration's hair is never touched. No hair is pasted back afterwards.
- openaiChildHair: with the OpenAI provider, repaint the child's whole head --
  their own hairstyle included -- instead of only the face inside the traced
  outline. Off keeps the illustration's hair, as before.
"""
from __future__ import annotations

import contextvars
import json
import os

from .config import settings

DEFAULTS: dict = {
    "faceOutlineEnabled": True,
    # Country code, no "+" — wa.me wants 919003169615, not +91 90031 69615.
    "whatsappNumber": "919003169615",
    # "segmind" | "openai". Segmind stays the default: it is an order of magnitude
    # cheaper per page and has no content-moderation gate on children's photos.
    "imageProvider": "segmind",
    # The plate's hair, not the child's, above the brow line. A photograph's
    # fringe on a drawn head reads as a photograph pasted on, and a face is
    # recognised by eyes, nose, mouth and jaw -- all of which sit below the
    # line, so the likeness survives. Off keeps the swapper's own hair, which
    # is closer to the real child and, on this artwork, looks it.
    # Env sets the starting position; the admin toggle overrides it at runtime.
    "keepTemplateAboveBrows": settings.keep_template_above_brows,
    "segmindRawOutput": False,
    "openaiChildHair": False,
    "segmindHairMask": False,
}

IMAGE_PROVIDERS = ("segmind", "openai")


def _path() -> str:
    return os.path.join(settings.storage_dir, "app_settings.json")


def get_settings() -> dict:
    """All settings, with defaults filled in for any missing keys."""
    data = {}
    try:
        with open(_path(), "r", encoding="utf-8") as f:
            data = json.load(f) or {}
    except Exception:
        data = {}
    return {**DEFAULTS, **data}


def update_settings(patch: dict) -> dict:
    """Merge `patch` into the stored settings (only known keys) and persist."""
    current = get_settings()
    for k, v in (patch or {}).items():
        if k in DEFAULTS:
            current[k] = v
    os.makedirs(settings.storage_dir, exist_ok=True)
    with open(_path(), "w", encoding="utf-8") as f:
        json.dump(current, f)
    return current


def face_outline_enabled() -> bool:
    return bool(get_settings().get("faceOutlineEnabled", True))


def keep_template_above_brows() -> bool:
    return bool(get_settings().get("keepTemplateAboveBrows", True))


def segmind_raw_output() -> bool:
    return bool(get_settings().get("segmindRawOutput", False))


# A book's own hair choice, set by the render task for the book it is rendering
# (each Celery task runs in its own asyncio.run, so this never leaks between
# books). None = follow the global switches.
HAIR_MODES = ("child", "illustration")
_book_hair_mode: contextvars.ContextVar = contextvars.ContextVar("book_hair_mode", default=None)


def set_book_hair_mode(mode) -> None:
    _book_hair_mode.set(mode if mode in HAIR_MODES else None)


def segmind_mode() -> str:
    """How the Segmind swap is used for the page being rendered:
    "raw" (as returned), "mask" (face-only masked swap) or "default".
    The book's own choice wins over the global Settings switches."""
    book = _book_hair_mode.get()
    if book == "child":
        return "raw"
    if book == "illustration":
        return "mask"
    if segmind_raw_output():
        return "raw"
    if segmind_hair_mask():
        return "mask"
    return "default"


def segmind_hair_mask() -> bool:
    return bool(get_settings().get("segmindHairMask", False))


def openai_child_hair() -> bool:
    return bool(get_settings().get("openaiChildHair", False))


def image_provider() -> str:
    """Active face-personalization provider. Unknown values fall back to segmind
    so a hand-edited settings file can never leave rendering with no provider."""
    v = str(get_settings().get("imageProvider", "segmind") or "").strip().lower()
    return v if v in IMAGE_PROVIDERS else "segmind"


def whatsapp_number() -> str:
    """Digits only — anything the admin types is normalised on the way in."""
    return str(get_settings().get("whatsappNumber", "") or "").strip()


def normalize_whatsapp(value: str) -> str:
    """Strip +, spaces, dashes and brackets; keep the digits wa.me needs."""
    return "".join(c for c in str(value or "") if c.isdigit())
