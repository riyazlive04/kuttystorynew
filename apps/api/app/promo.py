"""Promo-code rules. Single source of truth for server-side discount math."""
from __future__ import annotations

from typing import Optional

# code -> (rate, min_items)
PROMOS: dict[str, tuple[float, int]] = {
    "STORY20": (0.20, 2),  # 20% off when 2+ books
}


def compute_discount(
    code: Optional[str], subtotal: int, quantity: int
) -> tuple[int, Optional[str]]:
    """Return (discount_amount, normalized_code) or (0, None) if not applicable."""
    if not code:
        return 0, None
    normalized = code.strip().upper()
    rule = PROMOS.get(normalized)
    if not rule:
        return 0, None
    rate, min_items = rule
    if quantity < min_items:
        return 0, None
    return round(subtotal * rate), normalized
