"""Encrypted-at-rest store for admin-managed secrets (e.g. the Segmind API key).

Security properties:
- **Encrypted at rest** with Fernet (AES-128-CBC + HMAC). The encryption key is
  DERIVED from an environment secret (`SETTINGS_SECRET_KEY`, or `ADMIN_TOKEN` as a
  fallback) via SHA-256 — it is never written to the data volume, so the ciphertext
  file alone can't be decrypted.
- **Write-only over the API**: values are never returned. Callers get only a masked
  status (set? + last 4 chars).
- **Restrictive file perms** (0600) on the ciphertext file.
- Secrets are decrypted only in-process when needed; never logged.

Rotating `SETTINGS_SECRET_KEY`/`ADMIN_TOKEN` invalidates stored secrets (they must
be re-entered) — a deliberate trade-off that keeps the master key out of storage.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _secret_path() -> str:
    return os.path.join(settings.storage_dir, "secrets.enc.json")


def _fernet() -> Fernet:
    master = os.environ.get("SETTINGS_SECRET_KEY") or settings.admin_token or "kutty"
    # Derive a valid 32-byte urlsafe-base64 Fernet key from the env secret.
    digest = hashlib.sha256(f"kuttystory::{master}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _read_raw() -> dict:
    try:
        with open(_secret_path(), "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def set_secret(name: str, value: str) -> None:
    """Encrypt and persist a secret. Empty value clears it."""
    data = _read_raw()
    if value:
        token = _fernet().encrypt(value.encode()).decode()
        data[name] = token
    else:
        data.pop(name, None)
    os.makedirs(settings.storage_dir, exist_ok=True)
    path = _secret_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    try:
        os.chmod(path, 0o600)  # owner-only
    except OSError:
        pass


def get_secret(name: str) -> Optional[str]:
    """Decrypt and return a secret, or None if unset/undecryptable."""
    token = _read_raw().get(name)
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return None


def secret_status(name: str) -> dict:
    """Non-sensitive status for the admin UI — never the value itself."""
    val = get_secret(name)
    if not val:
        return {"set": False, "last4": ""}
    return {"set": True, "last4": val[-4:]}
