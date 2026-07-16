"""GPU render providers.

Dispatches a single page-personalization render to the configured backend and
returns a public image URL. Supported providers (env GPU_PROVIDER):

  mock      - deterministic placeholder, no GPU (default)
  runpod    - RunPod Serverless running a ComfyUI worker (recommended for prod)
  replicate - a Replicate model version
  comfyui   - a self-hosted ComfyUI API node

Each adapter takes a normalized `workflow_input` dict:
  { page_index, child_name, skin_tone, gender, language, photo_url, base_image }
"""
from __future__ import annotations

import asyncio

import httpx

from .config import settings

def _mock(workflow_input: dict) -> str:
    # Keep the page's base illustration (a bundled /covers/*.svg). A real GPU
    # provider would composite the child's likeness onto this base.
    base = workflow_input.get("base_image")
    if base:
        return base
    idx = int(workflow_input.get("page_index", 0)) + 1
    return f"/covers/journey-to-the-stars-{(idx % 3) + 1}.svg"


def build_comfy_workflow(workflow_input: dict) -> dict:
    """Construct the ComfyUI prompt graph for one personalized page.

    This is a minimal, illustrative graph. Replace the node ids / class types
    with your actual face-personalization workflow (e.g. IPAdapter/InstantID +
    inpaint) exported from ComfyUI's "Save (API format)".
    """
    return {
        "3": {
            "class_type": "LoadImage",
            "inputs": {"image": workflow_input.get("photo_url", "")},
        },
        "4": {
            "class_type": "LoadImageFromUrl",
            "inputs": {"url": workflow_input.get("base_image", "")},
        },
        "10": {
            "class_type": "InstantIDFaceSwap",
            "inputs": {
                "face_image": ["3", 0],
                "target_image": ["4", 0],
                "strength": 0.85,
            },
        },
        "11": {
            "class_type": "SaveImage",
            "inputs": {"images": ["10", 0], "filename_prefix": "kutty_page"},
        },
    }


async def _runpod(workflow_input: dict) -> str:
    url = f"https://api.runpod.ai/v2/{settings.runpod_endpoint_id}/runsync"
    headers = {
        "Authorization": f"Bearer {settings.runpod_api_key}",
        "Content-Type": "application/json",
    }
    payload = {"input": {"workflow": build_comfy_workflow(workflow_input)}}
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    # RunPod ComfyUI workers typically return output image URLs or base64.
    output = data.get("output", {})
    images = output.get("images") or output.get("message") or []
    if isinstance(images, list) and images:
        first = images[0]
        return first.get("url") if isinstance(first, dict) else str(first)
    raise RuntimeError(f"RunPod returned no image: {data}")


async def _replicate(workflow_input: dict) -> str:
    headers = {
        "Authorization": f"Bearer {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }
    body = {
        "version": settings.replicate_model_version.split(":")[-1],
        "input": {
            "face_image": workflow_input.get("photo_url", ""),
            "base_image": workflow_input.get("base_image", ""),
            "prompt": f"children's book illustration of {workflow_input.get('child_name','a child')}",
        },
    }
    async with httpx.AsyncClient(timeout=180) as client:
        create = await client.post(
            "https://api.replicate.com/v1/predictions", headers=headers, json=body
        )
        create.raise_for_status()
        pred = create.json()
        get_url = pred["urls"]["get"]

        for _ in range(120):
            poll = await client.get(get_url, headers=headers)
            pred = poll.json()
            status = pred.get("status")
            if status == "succeeded":
                out = pred.get("output")
                return out[0] if isinstance(out, list) else str(out)
            if status in ("failed", "canceled"):
                raise RuntimeError(f"Replicate render {status}: {pred.get('error')}")
            await asyncio.sleep(1.5)
    raise RuntimeError("Replicate render timed out")


async def _comfyui(workflow_input: dict) -> str:
    headers = {"Authorization": f"Bearer {settings.comfyui_api_key}"}
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{settings.comfyui_base_url}/prompt",
            headers=headers,
            json={"prompt": build_comfy_workflow(workflow_input)},
        )
        resp.raise_for_status()
        prompt_id = resp.json()["prompt_id"]
        for _ in range(120):
            hist = await client.get(
                f"{settings.comfyui_base_url}/history/{prompt_id}", headers=headers
            )
            data = hist.json()
            if prompt_id in data:
                for node in data[prompt_id].get("outputs", {}).values():
                    for img in node.get("images", []):
                        return (
                            f"{settings.comfyui_base_url}/view?filename={img['filename']}"
                            f"&subfolder={img.get('subfolder','')}&type={img.get('type','output')}"
                        )
            await asyncio.sleep(1.5)
    raise RuntimeError("ComfyUI render timed out")


async def render_via_provider(workflow_input: dict) -> str:
    provider = settings.gpu_provider
    if provider == "runpod":
        return await _runpod(workflow_input)
    if provider == "replicate":
        return await _replicate(workflow_input)
    if provider == "comfyui":
        return await _comfyui(workflow_input)
    return _mock(workflow_input)
