"""Admin-toggleable runtime settings, persisted as a small JSON file on the
shared storage volume so both the API and the Celery worker read the same value
(no DB migration needed).

Currently holds:
- faceOutlineEnabled: master switch for the "trace the face outline" hair-keeping
  feature. When False, the swap replaces the whole head everywhere (outlines are
  ignored) and the editor hides the tracing UI.
- whatsappNumber: the business number behind the site's chat button. Held here
  rather than in NEXT_PUBLIC_WHATSAPP so changing it doesn't need a web rebuild.
"""
from __future__ import annotations

import json
import os

from .config import settings

DEFAULTS: dict = {
    "faceOutlineEnabled": True,
    # Country code, no "+" — wa.me wants 919003169615, not +91 90031 69615.
    "whatsappNumber": "919003169615",
}


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


def whatsapp_number() -> str:
    """Digits only — anything the admin types is normalised on the way in."""
    return str(get_settings().get("whatsappNumber", "") or "").strip()


def normalize_whatsapp(value: str) -> str:
    """Strip +, spaces, dashes and brackets; keep the digits wa.me needs."""
    return "".join(c for c in str(value or "") if c.isdigit())
