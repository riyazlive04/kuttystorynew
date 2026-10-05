"""ComfyUI / serverless-GPU adapter.

In production this submits a personalization workflow (face-swap + inpaint of
the child's likeness into each illustrated page) to a ComfyUI API node running
on RunPod or Replicate, then polls for the rendered images.

When COMFYUI_BASE_URL is not configured we fall back to a deterministic mock so
the whole pipeline is exercisable without a GPU.
"""
from __future__ import annotations

import httpx

from .config import settings

# Placeholder illustration pool used by the mock renderer, when there is NO
# backend GPU at all. It must never reach a real customer: these are unrelated
# Unsplash stock photos -- a snake on a branch turned up on page 3 of a Space
# Explorer book, because the story's gallery was empty and a queued job had not
# yet rendered anything over them. An un-rendered page shows nothing and lets
# the flip-book's own spinner speak; a wrong picture looks like the product.
_MOCK_ART = [
    "https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&q=80&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1474314170901-f351b68f544f?w=600&q=80&auto=format&fit=crop",
]

_CAPTIONS = [
    "Once upon a time there was a wonderful child named {name}.",
    "{name} woke up ready for an amazing adventure.",
    '"Today," said {name}, "anything is possible!"',
    "Along the way, {name} made a brand new friend.",
    "Together they discovered a secret hidden in plain sight.",
    "{name} was brave, even when things felt a little scary.",
    "With a big smile, {name} solved the puzzle.",
    "Everyone cheered for {name}!",
]


def build_pages(
    child_name: str,
    total: int,
    cover: str,
    gallery: list[str],
    cover_art: dict[int, str] | None = None,
    authored: "set[int] | None" = None,
) -> list[dict]:
    """Synthesize the preview page list (unlocked free preview + locked rest).

    `cover_art` maps a reserved cover page number to its authored base art; the
    covers bracket the story pages in reading order, matching what the worker
    writes once it takes over.

    `authored` is every story page the book actually has. Without it this list
    would be `total` pages long while the worker renders only the authored ones,
    and the flip-book would reflow under the customer the moment the first real
    page landed.
    """
    from .pages_layout import is_free, kind_of, reading_order

    # Real deployments have a GPU, so every story page is about to be rendered
    # for this child. Until that lands the page carries no image at all rather
    # than a stand-in from another book -- a stock photo of a snake in a Space
    # Explorer preview reads as a broken product, while an empty page reads as
    # one still being painted, which is what it is.
    if gallery:
        art = gallery
    elif settings.gpu_provider == "mock":
        art = _MOCK_ART or [cover]
    else:
        art = []  # pending: the worker is about to paint every page
    cover_art = cover_art or {}
    order = reading_order(set(cover_art) | set(authored or ()), total)
    free = settings.free_preview_pages
    pages: list[dict] = []
    for i, n in enumerate(order):
        caption_tpl = _CAPTIONS[abs(n) % len(_CAPTIONS)]
        pages.append(
            {
                "index": i,
                "pageNumber": n,
                "kind": kind_of(n),
                # No art and no stand-in = "" : the page is pending, and the
                # flip-book renders its own spinner for an empty imageUrl.
                "imageUrl": cover_art.get(n)
                or (art[abs(n) % len(art)] if art else "")
                or "",
                "caption": "" if n in cover_art else caption_tpl.format(name=child_name),
                "locked": not is_free(n, free),
            }
        )
    return pages


async def render_page(*, workflow_input: dict) -> str:
    """Render a single personalized page via the configured GPU provider.

    Delegates to app.providers, which dispatches on GPU_PROVIDER
    (mock | runpod | replicate | comfyui). Provider-specific HTTP lives there.
    """
    from .providers import render_via_provider

    return await render_via_provider(workflow_input)
