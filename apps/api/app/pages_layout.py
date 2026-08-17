"""Where the covers sit in a book.

The front and back covers are ordinary PageTemplate rows at RESERVED page
numbers, so they go through the exact same pipeline as a story page: authored
base art, face outline, face swap, and the burned-in text layer. Nothing about
rendering is special-cased for them — only their position and their free/locked
status is.

Reading order is  [front cover] -> 1..TOTAL -> [back cover].  Both covers are
optional: a book without a cover template simply has no cover page.
"""
from __future__ import annotations

FRONT_COVER = 0
BACK_COVER = -1
# The strip between the two covers on the printed wrap. Authored like any other
# page (art + burned-in text) but it is NOT part of the book the customer reads:
# it never enters the reading order, the flip-book, or the interior PDF.
SPINE = -2

COVER_NUMBERS = (FRONT_COVER, BACK_COVER)
# Authored assets that exist only for the printer.
PRINT_ONLY_NUMBERS = (SPINE,)

# A book is authored once per gender: the base illustration and its face outline
# are different, so "boy" and "girl" are separate sets of page templates.
VARIANTS = ("boy", "girl")
DEFAULT_VARIANT = "boy"


def normalize_variant(value) -> str:
    """Map anything (a job's gender, a query param, None) onto a variant key."""
    v = (value or "").strip().lower()
    return v if v in VARIANTS else DEFAULT_VARIANT


def other_variant(variant: str) -> str:
    return "girl" if normalize_variant(variant) == "boy" else "boy"

KIND_FRONT = "front_cover"
KIND_BACK = "back_cover"
KIND_SPINE = "spine"
KIND_STORY = "story"


def kind_of(page_number: int) -> str:
    if page_number == FRONT_COVER:
        return KIND_FRONT
    if page_number == BACK_COVER:
        return KIND_BACK
    if page_number == SPINE:
        return KIND_SPINE
    return KIND_STORY


def label_of(page_number: int) -> str:
    if page_number == FRONT_COVER:
        return "Front cover"
    if page_number == BACK_COVER:
        return "Back cover"
    if page_number == SPINE:
        return "Spine"
    return f"Page {page_number}"


def reading_order(template_numbers, total: int) -> list[int]:
    """The book's page numbers in reading order, covers included when authored.

    Print-only assets (the spine) are deliberately absent: they are not pages a
    child turns, so they must not appear in the preview or shift page numbering.
    """
    have = set(template_numbers or ())
    order: list[int] = []
    if FRONT_COVER in have:
        order.append(FRONT_COVER)
    order.extend(range(1, total + 1))
    if BACK_COVER in have:
        order.append(BACK_COVER)
    return order


def sort_key(page_number: int) -> tuple[int, int]:
    """Editor order: front cover, story pages, back cover, then the spine."""
    if page_number == FRONT_COVER:
        return (0, 0)
    if page_number == BACK_COVER:
        return (2, 0)
    if page_number == SPINE:
        return (3, 0)
    return (1, page_number)


def is_free(page_number: int, free_pages: int) -> bool:
    """The front cover is part of the free preview — it's the hook that sells the
    book. The back cover is a purchase artifact and stays locked."""
    if page_number == FRONT_COVER:
        return True
    if page_number in (BACK_COVER, SPINE):
        return False
    return page_number <= free_pages


def render_seed(page_number: int) -> int:
    """Stable, non-negative per-page seed (page -1 must not seed to -7)."""
    return (abs(page_number) + 1) * 7
