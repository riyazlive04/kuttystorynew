"""AI story author — generates a full, coherent, personalized children's-book
narrative via a hosted LLM.

Diffrun-style: the story is authored ONCE per book with a literal ``{{name}}``
placeholder (name-agnostic) and a matching illustration prompt per page. Each
customer's preview then substitutes their child's name and renders their face —
so every child gets the same professionally-structured story, personalized.

Provider is auto-selected by which key is configured (best first):
Anthropic Claude → OpenAI → Replicate (uses the token already present). Callers
don't change; dropping in ANTHROPIC_API_KEY/OPENAI_API_KEY upgrades quality.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx

from .config import settings
from .generation_engine import _replicate_create, _replicate_headers

_SYSTEM = (
    "You are an award-winning children's picture-book author. You write warm, "
    "gentle, rhythmic, age-appropriate stories with a clear narrative arc. You "
    "ALWAYS return strict JSON only — no preamble, no explanation, no markdown "
    "code fences."
)


def _build_prompt(
    title: str, premise: str, num_pages: int, min_age: int, max_age: int, gender: str
) -> str:
    hero = {"boy": "boy", "girl": "girl"}.get(gender, "child")
    return f"""Write a complete personalized children's picture book.

Title: "{title}"
Premise: {premise or title}
Reader age: {min_age}-{max_age} years.
Hero: a {hero} named {{{{name}}}} — use the LITERAL placeholder {{{{name}}}} every
time the child's name appears. Never invent a name.

Write EXACTLY {num_pages} pages forming ONE coherent story: a gentle setup, a
small adventure full of wonder, a tiny challenge met with courage and kindness,
and a cozy, reassuring resolution. Keep it positive, warm and calm.

For EACH page return an object with:
  - "storyText": 1-2 short sentences (about 12-22 words total), warm and rhythmic,
    using {{{{name}}}} where natural.
  - "scenePrompt": one vivid line describing that exact illustrated moment —
    the setting, what {{{{name}}}} is doing, the mood and time of day. Feature a
    single {hero} character. Do NOT put any words or text inside the illustration.

Return ONLY a JSON array of EXACTLY {num_pages} objects, each with keys
"storyText" and "scenePrompt". Output nothing else."""


def _extract_json_array(text: str) -> list[dict]:
    """Pull the first JSON array out of the model's reply and parse it."""
    m = re.search(r"\[\s*\{.*\}\s*\]", text, re.DOTALL)
    if not m:
        raise ValueError(f"LLM did not return a JSON array. Got: {text[:200]!r}")
    return json.loads(m.group(0))


# --------------------------------------------------------------------------- #
#  Providers (REST, no SDK dependency)                                         #
# --------------------------------------------------------------------------- #

async def _anthropic_complete(prompt: str, max_tokens: int) -> str:
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "system": _SYSTEM,
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
        r.raise_for_status()
        data = r.json()
        return "".join(b.get("text", "") for b in data.get("content", []))


async def _openai_complete(prompt: str, max_tokens: int) -> str:
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.openai_model,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": prompt},
        ],
    }
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post("https://api.openai.com/v1/chat/completions", headers=headers, json=body)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


async def _replicate_complete(prompt: str, max_tokens: int) -> str:
    model = settings.replicate_story_model
    headers = _replicate_headers()
    inp: dict[str, Any] = {
        "prompt": prompt,
        "system_prompt": _SYSTEM,
        "max_tokens": max_tokens,
        "temperature": 0.75,
        "top_p": 0.9,
    }
    async with httpx.AsyncClient(timeout=300) as client:
        pred = await _replicate_create(client, model, inp, headers)
        get_url = pred.get("urls", {}).get("get")
        for _ in range(150):
            status = pred.get("status")
            if status == "succeeded":
                out = pred.get("output")
                return "".join(out) if isinstance(out, list) else str(out)
            if status in ("failed", "canceled"):
                raise RuntimeError(f"story LLM {status}: {pred.get('error')}")
            await asyncio.sleep(2)
            pred = (await client.get(get_url, headers=headers)).json()
    raise RuntimeError("story LLM timed out")


def active_provider() -> str:
    if settings.anthropic_api_key:
        return "anthropic"
    if settings.openai_api_key:
        return "openai"
    return "replicate"


async def _complete(prompt: str, max_tokens: int) -> str:
    provider = active_provider()
    if provider == "anthropic":
        return await _anthropic_complete(prompt, max_tokens)
    if provider == "openai":
        return await _openai_complete(prompt, max_tokens)
    return await _replicate_complete(prompt, max_tokens)


# --------------------------------------------------------------------------- #
#  Public API                                                                  #
# --------------------------------------------------------------------------- #

async def generate_story_pages(
    *,
    title: str,
    premise: str,
    num_pages: int,
    min_age: int = 2,
    max_age: int = 8,
    gender: str = "neutral",
) -> list[dict]:
    """Return [{pageNumber, storyText, scenePrompt}, ...] for a full book."""
    num_pages = max(1, min(28, num_pages))
    prompt = _build_prompt(title, premise, num_pages, min_age, max_age, gender)
    max_tokens = min(4096, 180 * num_pages + 600)
    text = await _complete(prompt, max_tokens)
    raw = _extract_json_array(text)
    pages: list[dict] = []
    for i, item in enumerate(raw[:num_pages], start=1):
        story_text = str(item.get("storyText", "")).strip()
        scene_prompt = str(item.get("scenePrompt", "")).strip()
        if not story_text and not scene_prompt:
            continue
        pages.append(
            {"pageNumber": i, "storyText": story_text, "scenePrompt": scene_prompt}
        )
    if not pages:
        raise RuntimeError("story LLM returned no usable pages")
    return pages
