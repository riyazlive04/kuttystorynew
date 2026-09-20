"""What each edition costs, on the server.

The storefront has the same three numbers in apps/web/src/lib/pricing.ts, but
these are the ones that decide what a customer is charged: an order's line
prices are taken from here, not from the cart the browser posts. Keep the two
files in step when a price changes.
"""
from __future__ import annotations

PRICES: dict[str, int] = {
    "pdf": 399,
    "staple": 799,
    "print": 1299,
}

LABELS: dict[str, str] = {
    "pdf": "PDF Version",
    "staple": "Staple Bound",
    "print": "Premium Hardbound",
}

# Editions that are printed and posted, so the order needs an address.
SHIPPED = {"staple", "print"}


def price_for(fmt: str) -> int:
    """The price of an edition. Unknown editions are refused, not guessed."""
    try:
        return PRICES[(fmt or "").strip().lower()]
    except KeyError:
        raise ValueError(f"Unknown format: {fmt!r}") from None


def label_for(fmt: str) -> str:
    return LABELS.get((fmt or "").strip().lower(), (fmt or "").title())
