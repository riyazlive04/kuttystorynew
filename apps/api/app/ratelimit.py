"""Fixed-window per-key rate limiting, backed by the Redis we already run for
Celery.

Used by the public /compare endpoint, which fans an upload out to PAID image
providers. Without a limit that endpoint is an open spend faucet: every
anonymous click costs real money, and a loop costs a lot of it overnight.

Fails CLOSED on a Redis outage for exactly that reason — an endpoint that bills
per call must not become unlimited because the limiter is unavailable. (The
free-of-charge parts of the app don't use this, so a Redis outage doesn't take
the storefront down with it.)
"""
from __future__ import annotations

from typing import Optional

from .config import settings


class RateLimited(Exception):
    """Raised when a key has spent its window budget. `retry_after` is seconds."""

    def __init__(self, retry_after: int):
        self.retry_after = max(1, int(retry_after))
        super().__init__(f"Rate limited; retry in {self.retry_after}s")


def _client():
    import redis  # imported lazily so the module is importable without redis

    return redis.Redis.from_url(settings.redis_url, socket_timeout=2)


def check_and_consume(key: str, limit: int, window_seconds: int) -> int:
    """Consume one unit of `key`'s budget. Returns how many remain in the window.

    Raises RateLimited when the budget is spent, or when Redis can't be reached
    (fail-closed — see the module docstring).
    """
    if limit <= 0:
        raise RateLimited(window_seconds)
    bucket = f"ratelimit:{key}"
    try:
        r = _client()
        pipe = r.pipeline()
        pipe.incr(bucket, 1)
        pipe.ttl(bucket)
        count, ttl = pipe.execute()
        count = int(count)
        # First hit in a fresh window (or a key that somehow lost its TTL) —
        # (re)arm the expiry so the window can actually roll over.
        if count == 1 or int(ttl) < 0:
            r.expire(bucket, window_seconds)
            ttl = window_seconds
        if count > limit:
            raise RateLimited(int(ttl) if int(ttl) > 0 else window_seconds)
        return max(0, limit - count)
    except RateLimited:
        raise
    except Exception as e:  # noqa: BLE001 — Redis unreachable
        print(f"[ratelimit] failing closed, redis unavailable: {e}", flush=True)
        raise RateLimited(window_seconds)


def client_key(request, prefix: str) -> str:
    """A per-caller key from the request.

    Prefers the left-most X-Forwarded-For hop, since the API sits behind nginx
    (see infra/nginx) and request.client.host would otherwise be the proxy for
    every caller — one shared bucket for the whole internet.
    """
    fwd: Optional[str] = request.headers.get("x-forwarded-for")
    if fwd:
        ip = fwd.split(",")[0].strip()
    else:
        ip = getattr(getattr(request, "client", None), "host", "") or "unknown"
    return f"{prefix}:{ip}"
