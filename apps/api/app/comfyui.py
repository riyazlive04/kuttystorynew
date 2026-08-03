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

# Placeholder illustration pool used by the mock renderer.
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
) -> list[dict]:
    """Synthesize the preview page list (unlocked free preview + locked rest).

    `cover_art` maps a reserved cover page number to its authored base art; the
    covers bracket the story pages in reading order, matching what the worker
    writes once it takes over.
    """
    from .pages_layout import is_free, kind_of, reading_order

    art = gallery or _MOCK_ART or [cover]
    cover_art = cover_art or {}
    order = reading_order(cover_art.keys(), total)
    free = settings.free_preview_pages
    pages: list[dict] = []
    for i, n in enumerate(order):
        caption_tpl = _CAPTIONS[abs(n) % len(_CAPTIONS)]
        pages.append(
            {
                "index": i,
                "pageNumber": n,
                "kind": kind_of(n),
                "imageUrl": cover_art.get(n) or art[abs(n) % len(art)] or cover,
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
