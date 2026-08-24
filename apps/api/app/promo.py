"""Promo-code rules. Single source of truth for server-side discount math."""
from __future__ import annotations

from typing import Optional

from .config import settings

# code -> (rate, min_items)
PROMOS: dict[str, tuple[float, int]] = {
    "STORY20": (0.20, 2),  # 20% off when 2+ books
}

# What gets recorded against an order placed with the private admin code. The
# code itself is deliberately NOT stored: it would then be sitting in the admin
# order list, which is exactly where a screenshot or a shared session leaks it.
ADMIN_TEST_LABEL = "ADMIN-TEST"

# Razorpay rejects anything under ₹1, so a fixed-total code can never go below it.
GATEWAY_MIN_RUPEES = 1


def _is_admin_test_code(normalized: str) -> bool:
    """True when the code matches the private admin test code, if one is set.

    Unset means the code is disabled outright — there is no build-time default,
    so a deploy that never configures it simply has no such code.
    """
    configured = (settings.admin_test_promo_code or "").strip().upper()
    return bool(configured) and normalized == configured


def compute_discount(
    code: Optional[str], subtotal: int, quantity: int
) -> tuple[int, Optional[str]]:
    """Return (discount_amount, normalized_code) or (0, None) if not applicable."""
    if not code:
        return 0, None
    normalized = code.strip().upper()

    # Private admin code: collapse the order to a fixed rupee amount so a real
    # payment can be put through the LIVE gateway for pennies.
    if _is_admin_test_code(normalized):
        target = max(GATEWAY_MIN_RUPEES, settings.admin_test_promo_total)
        if subtotal <= target:
            return 0, ADMIN_TEST_LABEL
        return subtotal - target, ADMIN_TEST_LABEL

    rule = PROMOS.get(normalized)
    if not rule:
        return 0, None
    rate, min_items = rule
    if quantity < min_items:
        return 0, None
    return round(subtotal * rate), normalized


def describe(code: Optional[str], subtotal: int, quantity: int) -> dict:
    """Validate a code for the checkout UI.

    Returns the discount plus a message to show the shopper. An unknown code and
    a wrong-conditions code are reported the same way to anyone who didn't type
    the admin code, so this endpoint can't be used to probe for its existence.
    """
    if not code or not code.strip():
        return {"ok": False, "discount": 0, "code": None, "message": "Enter a code."}

    normalized = code.strip().upper()

    if _is_admin_test_code(normalized):
        discount, label = compute_discount(code, subtotal, quantity)
        target = max(GATEWAY_MIN_RUPEES, settings.admin_test_promo_total)
        return {
            "ok": True,
            "discount": discount,
            "code": label,
            "message": f"Test code applied — total set to ₹{target}.",
        }

    rule = PROMOS.get(normalized)
    if not rule:
        return {
            "ok": False,
            "discount": 0,
            "code": None,
            "message": "That code isn't valid.",
        }

    _, min_items = rule
    if quantity < min_items:
        return {
            "ok": False,
            "discount": 0,
            "code": None,
            "message": f"Add {min_items}+ books to use {normalized}.",
        }

    discount, applied = compute_discount(code, subtotal, quantity)
    return {
        "ok": True,
        "discount": discount,
        "code": applied,
        "message": "20% discount applied! 🎉",
    }
