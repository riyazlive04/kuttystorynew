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
"""
from __future__ import annotations

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
