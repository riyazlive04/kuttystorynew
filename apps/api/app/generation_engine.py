"""KuttyStory generation engine.

Cost/quality profile (targets Diffrun-grade zero-shot identity at <Rs 0.30/frame):

  * Base model : FLUX.1-schnell, FP8 (fp8_e4m3fn) weights
  * Identity   : PuLID-FLUX  (id_weight = 0.85), zero-shot, no per-child training
  * Sampler    : 4 steps, euler / sgm_uniform, cfg 1.0  (Schnell distilled)
  * Canvas     : 1024 x 768
  * Optimization: the child's face embedding is extracted ONCE
    (extract_identity) and cached in Job.identityVectors. Every page render
    reuses that embedding, so the heavy InsightFace + EVA-CLIP encoders run a
    single time per book instead of once per page.

Runs against RunPod Serverless (a ComfyUI worker) when GPU_PROVIDER=runpod;
otherwise a deterministic mock keeps the whole pipeline exercisable with no GPU.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
from typing import Any, Optional

import httpx
from PIL import Image, ImageDraw, ImageFilter

from .config import settings

# --- Frozen generation constants (this is what buys the cost/quality profile) ---
FLUX_SAMPLER = {
    "steps": 4,
    "cfg": 1.0,
    "sampler_name": "euler",
    "scheduler": "sgm_uniform",
    "denoise": 1.0,
}
GEN = {
    "width": 1024,
    "height": 768,
    "pulid_id_weight": 0.85,
    # All-in-one FLUX-schnell FP8 checkpoint (model + clip + t5 + vae bundled),
    # loaded with CheckpointLoaderSimple. Matches the JarvisLabs template.
    "checkpoint": "flux1-schnell-fp8.safetensors",
    "pulid_file": "pulid_flux_v0.9.1.safetensors",
    "pulid_start_at": 0.0,
    "pulid_end_at": 1.0,
}

# FaceDetailer (inpaint-over-template) params. Only the detected/authored face
# region is regenerated, so the illustrated scene + character stay consistent
# across every page (Diffrun behaviour). Low denoise blends into the art style.
DETAILER = {
    "guide_size": 512,
    "max_size": 1024,
    "denoise": 0.55,
    "feather": 12,
    "bbox_threshold": 0.45,
    "bbox_dilation": 8,
    "bbox_crop_factor": 2.2,
    "detector": "bbox/face_yolov8m.pt",
}

# Rough per-frame economics for the cost target (tune to your GPU rate).
# A 4090 spot at ~$0.00016/s * ~2.5s/frame ~= $0.0004 ~= Rs 0.034 GPU + overhead.
COST_PER_FRAME_INR = 0.30


# --------------------------------------------------------------------------- #
#  ComfyUI graph builders (API / "Save (API format)" node ids)                #
# --------------------------------------------------------------------------- #

def _flux_backbone(scene_prompt: str) -> dict[str, Any]:
    """All-in-one FLUX-schnell FP8 checkpoint + positive prompt + empty latent.
    Node 10 outputs: [10,0]=MODEL, [10,1]=CLIP, [10,2]=VAE."""
    return {
        "10": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": GEN["checkpoint"]},
        },
        "20": {
            "class_type": "CLIPTextEncode",
            "inputs": {"clip": ["10", 1], "text": scene_prompt},
        },
        "21": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": GEN["width"], "height": GEN["height"], "batch_size": 1},
        },
    }


def build_identity_extract_graph(face_image_name: str) -> dict[str, Any]:
    """One-time graph: run InsightFace + EVA-CLIP and RETURN the id embeds.

    The RunPod worker is expected to expose a `PulidFluxExtractEmbeds` node that
    serialises the embedding to JSON so we can cache it in the DB.
    """
    return {
        "1": {"class_type": "LoadImage", "inputs": {"image": face_image_name}},
        "2": {"class_type": "PulidFluxInsightFaceLoader", "inputs": {"provider": "CUDA"}},
        "3": {"class_type": "PulidFluxEvaClipLoader", "inputs": {}},
        "4": {
            "class_type": "PulidFluxExtractEmbeds",
            "inputs": {
                "face_analysis": ["2", 0],
                "eva_clip": ["3", 0],
                "image": ["1", 0],
            },
        },
        "5": {
            "class_type": "SaveEmbedsJson",  # worker returns this as output.embeds
            "inputs": {"embeds": ["4", 0], "filename_prefix": "id"},
        },
    }


def _apply_pulid(graph: dict, model_ref, id_embeds, face_image_name):
    """Attach PuLID identity to `model_ref`; returns the node id producing the
    identity-conditioned model. Uses cached embeds (fast path) when available."""
    graph["30"] = {"class_type": "PulidFluxModelLoader", "inputs": {"pulid_file": GEN["pulid_file"]}}
    if id_embeds is not None:
        graph["31"] = {
            "class_type": "ApplyPulidFluxFromEmbeds",
            "inputs": {
                "model": model_ref,
                "pulid_flux": ["30", 0],
                "embeds": id_embeds,
                "weight": GEN["pulid_id_weight"],
                "start_at": GEN["pulid_start_at"],
                "end_at": GEN["pulid_end_at"],
            },
        }
    else:
        graph["2"] = {"class_type": "PulidFluxInsightFaceLoader", "inputs": {"provider": "CUDA"}}
        graph["3"] = {"class_type": "PulidFluxEvaClipLoader", "inputs": {}}
        # Always LoadImageFromUrl so the ComfyUI bridge uploads it (handles both
        # local /uploads paths and public URLs).
        graph["1b"] = {"class_type": "LoadImageFromUrl", "inputs": {"url": face_image_name or ""}}
        graph["31"] = {
            "class_type": "ApplyPulidFlux",
            "inputs": {
                "model": model_ref,
                "pulid_flux": ["30", 0],
                "eva_clip": ["3", 0],
                "face_analysis": ["2", 0],
                "image": ["1b", 0],
                "weight": GEN["pulid_id_weight"],
                "start_at": GEN["pulid_start_at"],
                "end_at": GEN["pulid_end_at"],
            },
        }
    # FixPulidFluxPatch (lldacing fork) rewrites the FLUX forward patch for newer
    # ComfyUI - resolves "forward_orig() got an unexpected keyword argument
    # 'timestep_zero_index'".
    graph["32"] = {"class_type": "FixPulidFluxPatch", "inputs": {"model": ["31", 0]}}
    return ["32", 0]


def build_inpaint_graph(
    *,
    base_image_url: str,
    style_prompt: str,
    id_embeds: Optional[list] = None,
    face_image_name: Optional[str] = None,
    face_region: Optional[dict] = None,
    seed: int = 0,
) -> dict[str, Any]:
    """Diffrun-style inpaint-over-template graph.

    Loads the pre-drawn illustrated page (`base_image_url`), applies PuLID
    identity to the FLUX model, then regenerates ONLY the face region with
    FaceDetailer - the rest of the illustration (scene, style, character body)
    is preserved byte-for-byte, giving page-to-page consistency.

    If `face_region` (x,y,w,h in %) is provided the mask is built from it;
    otherwise the face is auto-detected with a YOLO bbox detector.
    """
    graph: dict[str, Any] = {
        "10": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": GEN["checkpoint"]}},
        "20": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["10", 1], "text": style_prompt}},
        "20n": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["10", 1], "text": "photorealistic, distorted, extra faces, deformed"}},
        "1": {"class_type": "LoadImageFromUrl", "inputs": {"url": base_image_url}},
    }

    model_ref = _apply_pulid(graph, ["10", 0], id_embeds, face_image_name)

    detailer_inputs = {
        "image": ["1", 0],
        "model": model_ref,
        "clip": ["10", 1],
        "vae": ["10", 2],
        "positive": ["20", 0],
        "negative": ["20n", 0],
        "seed": seed,
        "steps": FLUX_SAMPLER["steps"],
        "cfg": FLUX_SAMPLER["cfg"],
        "sampler_name": FLUX_SAMPLER["sampler_name"],
        "scheduler": FLUX_SAMPLER["scheduler"],
        "denoise": DETAILER["denoise"],
        "feather": DETAILER["feather"],
        "guide_size": DETAILER["guide_size"],
        "guide_size_for": True,
        "max_size": DETAILER["max_size"],
        "noise_mask": True,
        "force_inpaint": True,
        "bbox_threshold": DETAILER["bbox_threshold"],
        "bbox_dilation": DETAILER["bbox_dilation"],
        "bbox_crop_factor": DETAILER["bbox_crop_factor"],
        "sam_detection_hint": "center-1",
        "sam_dilation": 0,
        "sam_threshold": 0.93,
        "sam_bbox_expansion": 0,
        "sam_mask_hint_threshold": 0.7,
        "sam_mask_hint_use_negative": "False",
        "drop_size": 10,
        "wildcard": "",
        "cycle": 1,
    }

    if face_region:
        # Manual authored region -> build a feathered rectangular mask.
        graph["60"] = {
            "class_type": "MaskFromRegion",  # worker helper: x/y/w/h are 0-1 fractions
            "inputs": {
                "image": ["1", 0],
                "x": face_region["x"] / 100.0,
                "y": face_region["y"] / 100.0,
                "w": face_region["w"] / 100.0,
                "h": face_region["h"] / 100.0,
                "feather": DETAILER["feather"],
            },
        }
        detailer_inputs["mask"] = ["60", 0]
        graph["52"] = {"class_type": "DetailerForEach", "inputs": detailer_inputs}
    else:
        # Auto-detect the face in the illustration.
        graph["50"] = {"class_type": "UltralyticsDetectorProvider", "inputs": {"model_name": DETAILER["detector"]}}
        detailer_inputs["bbox_detector"] = ["50", 0]
        graph["52"] = {"class_type": "FaceDetailer", "inputs": detailer_inputs}

    graph["42"] = {"class_type": "SaveImage", "inputs": {"images": ["52", 0], "filename_prefix": "kutty_page"}}
    return graph


def build_render_graph(
    scene_prompt: str,
    *,
    id_embeds: Optional[list] = None,
    face_image_name: Optional[str] = None,
    seed: int = 0,
) -> dict[str, Any]:
    """txt2img fallback (used only when a page has no base illustration)."""
    graph = _flux_backbone(scene_prompt)
    model_ref = _apply_pulid(graph, ["10", 0], id_embeds, face_image_name)
    graph["40"] = {
        "class_type": "KSampler",
        "inputs": {
            "model": model_ref,
            "positive": ["20", 0],
            "negative": ["20", 0],
            "latent_image": ["21", 0],
            "seed": seed,
            **FLUX_SAMPLER,
        },
    }
    graph["41"] = {"class_type": "VAEDecode", "inputs": {"samples": ["40", 0], "vae": ["10", 2]}}
    graph["42"] = {"class_type": "SaveImage", "inputs": {"images": ["41", 0], "filename_prefix": "kutty_page"}}
    return graph


# --------------------------------------------------------------------------- #
#  RunPod Serverless transport                                                 #
# --------------------------------------------------------------------------- #

async def _runpod_run(payload: dict) -> dict:
    url = f"https://api.runpod.ai/v2/{settings.runpod_endpoint_id}/runsync"
    headers = {"Authorization": f"Bearer {settings.runpod_api_key}"}
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(url, headers=headers, json={"input": payload})
        resp.raise_for_status()
        return resp.json()


def _image_bytes(src: str) -> bytes:
    """Read an image the worker needs to hand to ComfyUI. Our own /uploads live
    on a shared volume (read locally); anything else is fetched over HTTP."""
    if "/uploads/" in src:
        name = src.split("/uploads/", 1)[1]
        with open(os.path.join(settings.storage_dir, name), "rb") as f:
            return f.read()
    return httpx.get(src, timeout=60).content


async def _comfyui_run(graph: dict) -> str:
    """Submit a graph to a raw ComfyUI server (e.g. a JarvisLabs instance).

    First uploads every image referenced by a LoadImageFromUrl node straight
    into ComfyUI (its /upload/image endpoint) and rewrites the node to a plain
    LoadImage - so images never need to be publicly reachable and we don't
    depend on a URL-loader custom node being installed. Then polls /history.
    """
    base = settings.comfyui_base_url.rstrip("/")
    headers = {}
    if settings.comfyui_api_key:
        headers["Authorization"] = f"Bearer {settings.comfyui_api_key}"

    async with httpx.AsyncClient(timeout=240) as client:
        # 1) push referenced images into ComfyUI, swap to LoadImage
        for nid, node in list(graph.items()):
            if node.get("class_type") == "LoadImageFromUrl":
                url = node["inputs"].get("url") or ""
                if not url:
                    continue
                data = _image_bytes(url)
                up = await client.post(
                    f"{base}/upload/image",
                    headers=headers,
                    files={"image": (f"{nid}.png", data, "image/png")},
                    data={"overwrite": "true"},
                )
                up.raise_for_status()
                name = up.json().get("name", f"{nid}.png")
                graph[nid] = {"class_type": "LoadImage", "inputs": {"image": name}}

        # 2) queue the prompt
        resp = await client.post(f"{base}/prompt", headers=headers, json={"prompt": graph})
        resp.raise_for_status()
        prompt_id = resp.json()["prompt_id"]

        # 3) poll for the output image (or a surfaced execution error)
        for _ in range(400):  # ~10 min max (first render downloads ~4GB helper models)
            entry = (
                await client.get(f"{base}/history/{prompt_id}", headers=headers)
            ).json().get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    for m in status.get("messages", []):
                        if m[0] == "execution_error":
                            e = m[1]
                            raise RuntimeError(
                                f"ComfyUI node {e.get('node_type')} failed: "
                                f"{e.get('exception_type')}: {e.get('exception_message','').strip()}"
                            )
                    raise RuntimeError("ComfyUI render errored")
                for node in entry.get("outputs", {}).values():
                    for img in node.get("images", []):
                        return (
                            f"{base}/view?filename={img['filename']}"
                            f"&subfolder={img.get('subfolder','')}&type={img.get('type','output')}"
                        )
            await asyncio.sleep(1.5)
    raise RuntimeError("ComfyUI render timed out")


# --------------------------------------------------------------------------- #
#  Replicate (hosted PuLID-Flux) transport                                     #
# --------------------------------------------------------------------------- #

# Default hosted PuLID-Flux model. Override with REPLICATE_MODEL_VERSION
# ("owner/name" for latest, or "owner/name:versionhash" to pin).
DEFAULT_REPLICATE_MODEL = "zsxkib/flux-pulid"
DEFAULT_FACESWAP_MODEL = "fofr/face-swap-with-ideogram"
DEFAULT_TXT2IMG_MODEL = "black-forest-labs/flux-schnell"

# Per-model input-key mapping for the face-swap A/B candidates.
# value = (target/base-image key, character/face key, accepts a `prompt`)
_FACESWAP_INPUTS: dict[str, tuple[str, str, bool]] = {
    "fofr/face-swap-with-ideogram": ("target_image", "character_image", True),
    "cdingram/face-swap": ("input_image", "swap_image", False),
}


def _data_uri(src: str) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(_image_bytes(src)).decode()


def _b64(src: str) -> str:
    """Plain base64 (no data: prefix) — Segmind's API expects raw base64."""
    return base64.b64encode(_image_bytes(src)).decode()


def _save_bytes(data: bytes, prefix: str = "swap") -> str:
    """Persist raw image bytes to the shared volume, return its /uploads URL."""
    import uuid

    os.makedirs(settings.storage_dir, exist_ok=True)
    name = f"{prefix}_{uuid.uuid4().hex[:12]}.jpg"
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    return f"/uploads/{name}"


def _composite_face_region(template_src: str, swapped: bytes, region: dict) -> bytes:
    """Retain the template's HAIR by pasting only the FACE area from the fully
    swapped image back onto the original template.

    Segmind swaps the whole head (face + hair). We take just the authored face
    area from the swap and composite it over the untouched template — so:
    template hair/body + child's swapped face. `region` is either a freeform
    polygon {"points": [[x%,y%], ...]} (preferred) or a box {x,y,w,h} in PERCENT.
    """
    tmpl = Image.open(io.BytesIO(_image_bytes(template_src))).convert("RGB")
    swp = Image.open(io.BytesIO(swapped)).convert("RGB")
    if swp.size != tmpl.size:
        swp = swp.resize(tmpl.size)
    cw, ch = tmpl.size
    mask = Image.new("L", (cw, ch), 0)
    draw = ImageDraw.Draw(mask)

    points = region.get("points")
    if points and len(points) >= 3:
        # Freeform lasso — fill the traced polygon.
        try:
            poly = [(float(p[0]) / 100 * cw, float(p[1]) / 100 * ch) for p in points]
        except (TypeError, ValueError, IndexError):
            return swapped
        draw.polygon(poly, fill=255)
    else:
        try:
            x = float(region.get("x"))  # type: ignore[arg-type]
            y = float(region.get("y"))  # type: ignore[arg-type]
            w = float(region.get("w"))  # type: ignore[arg-type]
            h = float(region.get("h"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return swapped
        if w <= 0 or h <= 0:
            return swapped
        draw.ellipse(
            [x / 100 * cw, y / 100 * ch, (x + w) / 100 * cw, (y + h) / 100 * ch],
            fill=255,
        )

    # Feather the edge so the swapped face blends into the template's hairline.
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(3, int(min(cw, ch) * 0.02))))
    out = Image.composite(swp, tmpl, mask)  # swap inside region, template outside
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


def current_segmind_key() -> str:
    """The active Segmind key: an admin-set encrypted secret if present, else the
    SEGMIND_API_KEY from the environment."""
    from .secrets_store import get_secret

    return get_secret("segmind_api_key") or settings.segmind_api_key or ""


async def _segmind_faceswap(
    *,
    target_src: str,
    face_src: str,
    seed: int = 0,
    attempts: int = 4,
    face_region: Optional[dict] = None,
) -> str:
    """Personalize a real face (`face_src`) onto an ILLUSTRATED base page
    (`target_src`) via Segmind FaceSwap-Comic — purpose-built to blend real faces
    into cartoon/illustrated art while preserving the artistic look. Returns the
    saved /uploads URL of the swapped page.

    A page WITH base art must be personalized by the swapper, so on failure we
    REDO the faceswap (up to `attempts`) rather than substitute a different image.
    Each retry uses a fresh seed — face detection / blending is seed-sensitive, so
    a genuinely different attempt can succeed where an identical repeat would not.
    """
    api_key = current_segmind_key()
    if not api_key:
        raise RuntimeError("SEGMIND_API_KEY not set")
    # Validated against Segmind's faceswap-comic API (base64 images, x-api-key,
    # returns raw image bytes). style_strength keeps the illustration's art look;
    # cfg default is ~1.6 so we stay low to avoid over-cooking the face.
    url = f"https://api.segmind.com/v1/{settings.segmind_faceswap_model}"
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}
    source_b64 = _b64(face_src)     # the real child face
    target_b64 = _b64(target_src)   # the fixed illustrated page
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=180) as client:
        for attempt in range(attempts):
            payload = {
                "source_image": source_b64,
                "target_image": target_b64,
                "face_strength": 0.85,
                "style_strength": 0.7,
                "steps": 12,
                "cfg": 2,
                "seed": seed + attempt * 1009,  # fresh seed each redo
                "base64": False,
                "output_format": "jpeg",
            }
            try:
                r = await client.post(url, headers=headers, json=payload)
                r.raise_for_status()
                content = r.content
                # Keep the template's hair: paste only the authored face oval from
                # the full swap back onto the original template. (No face region →
                # full-head swap as before.)
                if face_region:
                    try:
                        content = _composite_face_region(
                            target_src, content, face_region
                        )
                    except Exception as ce:  # noqa: BLE001
                        print(f"[segmind] face composite skipped: {ce}", flush=True)
                return _save_bytes(content, prefix="page")
            except Exception as e:  # noqa: BLE001 — redo the swap on any failure
                last_err = e
                body = ""
                if isinstance(e, httpx.HTTPStatusError):
                    body = (e.response.text or "")[:300]
                print(
                    f"[segmind] faceswap attempt {attempt + 1}/{attempts} failed: "
                    f"{e} {body}",
                    flush=True,
                )
                if attempt < attempts - 1:
                    await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(
        f"Segmind faceswap failed after {attempts} attempts: {last_err}"
    )


# --------------------------------------------------------------------------- #
#  OpenAI gpt-image-1 face personalization                                     #
# --------------------------------------------------------------------------- #
#
#  Design notes — this path is optimised for COST and PAGE-TO-PAGE CONSISTENCY,
#  which turn out to be the same decision here:
#
#  * Only the authored FACE REGION is sent. We crop a padded square around the
#    page's faceX/Y/W/H box (or the facePath lasso's bounding box), personalize
#    just that crop, paste it back, then run the SAME feathered-mask composite the
#    Segmind path uses. Everything outside the face oval is therefore
#    byte-identical to the authored plate — scene, character body, art style and
#    hair cannot drift between pages, because they are never regenerated. A
#    whole-page edit would re-render all of it and reintroduce exactly the drift
#    the inpaint-over-template design exists to prevent.
#  * A face crop needs no more than the smallest square tier, so output image
#    tokens (the dominant cost) sit at the floor regardless of the plate's size.
#  * Free preview pages render a quality tier down from the paid render. Previews
#    are the bulk of spend — every visitor renders `free_preview_pages` of them,
#    including everyone who never buys.
#  * Identical inputs are served from a cache, so a retry, a re-render or a
#    regenerated preview never bills twice.

OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits"

# How much context around the face box to include in the crop. The model needs
# some hair/jaw/neck to blend the new face into, but every extra pixel is scene
# it could alter, so this stays tight.
FACE_CROP_PADDING = 0.6


def current_openai_key() -> str:
    """The active OpenAI key: an admin-set encrypted secret if present, else the
    OPENAI_API_KEY from the environment."""
    from .secrets_store import get_secret

    return get_secret("openai_api_key") or settings.openai_api_key or ""


def _region_bounds_pct(region: dict) -> Optional[tuple[float, float, float, float]]:
    """Face region -> (x, y, w, h) in PERCENT, whether it is a freeform lasso or
    an explicit box. Returns None if the region is unusable."""
    points = (region or {}).get("points")
    if points and len(points) >= 3:
        try:
            xs = [float(p[0]) for p in points]
            ys = [float(p[1]) for p in points]
        except (TypeError, ValueError, IndexError):
            return None
        return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
    try:
        x = float(region.get("x"))  # type: ignore[union-attr,arg-type]
        y = float(region.get("y"))  # type: ignore[union-attr,arg-type]
        w = float(region.get("w"))  # type: ignore[union-attr,arg-type]
        h = float(region.get("h"))  # type: ignore[union-attr,arg-type]
    except (TypeError, ValueError, AttributeError):
        return None
    if w <= 0 or h <= 0:
        return None
    return x, y, w, h


def _face_crop_box(
    region: dict, size: tuple[int, int]
) -> Optional[tuple[int, int, int, int]]:
    """A padded SQUARE crop box in pixels around the authored face region.

    Square because /images/edits renders to a square canvas — cropping square
    keeps the face's aspect ratio intact through the round trip. Clamped to the
    canvas, and shifted (not shrunk) when it would overhang an edge, so a face
    near the border still gets its full context.
    """
    bounds = _region_bounds_pct(region)
    if not bounds:
        return None
    cw, ch = size
    x, y, w, h = bounds
    px, py = x / 100 * cw, y / 100 * ch
    pw, ph = w / 100 * cw, h / 100 * ch
    cx, cy = px + pw / 2, py + ph / 2
    edge = max(pw, ph) * (1 + FACE_CROP_PADDING)
    edge = min(edge, float(min(cw, ch)))  # never larger than the canvas
    half = edge / 2
    left = int(round(min(max(cx - half, 0), cw - edge)))
    top = int(round(min(max(cy - half, 0), ch - edge)))
    side = int(round(edge))
    return left, top, left + side, top + side


def _openai_cache_path() -> str:
    return os.path.join(settings.storage_dir, "openai_face_cache.json")


def _openai_cache_key(*parts: Any) -> str:
    import hashlib

    h = hashlib.sha256()
    for p in parts:
        h.update(p if isinstance(p, bytes) else repr(p).encode())
        h.update(b"\x00")
    return h.hexdigest()


def _openai_cache_get(key: str) -> Optional[str]:
    if not settings.openai_cache_enabled:
        return None
    try:
        with open(_openai_cache_path(), "r", encoding="utf-8") as f:
            url = (json.load(f) or {}).get(key)
    except Exception:  # noqa: BLE001 — a missing/corrupt cache is just a miss
        return None
    if not url:
        return None
    # Only a hit if the file is still on the volume (retention sweeps delete it).
    name = url.split("/uploads/", 1)[-1]
    if not os.path.exists(os.path.join(settings.storage_dir, name)):
        return None
    return url


def _openai_cache_put(key: str, url: str) -> None:
    if not settings.openai_cache_enabled:
        return
    try:
        path = _openai_cache_path()
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f) or {}
        except Exception:  # noqa: BLE001
            data = {}
        data[key] = url
        os.makedirs(settings.storage_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception as e:  # noqa: BLE001 — caching must never fail a render
        print(f"[openai] cache write skipped: {e}", flush=True)


def _openai_prompt(style_prompt: Optional[str]) -> str:
    """One fixed instruction for every page. Deliberately identical across pages
    (only the page's own stylePrompt varies) so the model is never nudged toward
    a different reading of the character from one page to the next."""
    style = (style_prompt or "").strip()
    return (
        "The first image is a crop of a children's storybook illustration. The "
        "second image is a reference photo of a child. Redraw ONLY the face in "
        "the first image so it is recognisably the same child as in the reference "
        "photo - keep their face shape, eyes, eyebrows, nose, mouth and skin tone. "
        "Keep the illustration's exact art style, brushwork, colour palette, "
        "lighting direction and the character's existing hair, head angle and "
        "expression. Do not render the face photorealistically; it must stay a "
        "painted illustration. Change nothing else in the image."
        + (f" Art style: {style}." if style else "")
    )


def _openai_quality(is_preview: bool) -> str:
    """Previews render a tier down — they are the bulk of spend."""
    q = settings.openai_preview_quality if is_preview else settings.openai_image_quality
    return (q or "medium").strip().lower()


async def _openai_edit_call(
    *,
    scene_png: bytes,
    face_bytes: bytes,
    prompt: str,
    quality: str,
    attempts: int = 3,
) -> bytes:
    """POST one /images/edits call and return the produced PNG bytes.

    Retries transient failures (429 / 5xx / network) with backoff. A content-policy
    rejection is NOT retried — it is deterministic for the same inputs, so retrying
    only burns time before the same refusal.
    """
    api_key = current_openai_key()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")
    headers = {"Authorization": f"Bearer {api_key}"}
    data = {
        "model": settings.openai_image_model,
        "prompt": prompt,
        "size": settings.openai_image_size,
        "quality": quality,
        "input_fidelity": settings.openai_input_fidelity,
        "n": "1",
    }
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=300) as client:
        for attempt in range(attempts):
            files = [
                ("image[]", ("scene.png", scene_png, "image/png")),
                ("image[]", ("face.jpg", face_bytes, "image/jpeg")),
            ]
            try:
                r = await client.post(
                    OPENAI_IMAGE_EDITS_URL, headers=headers, data=data, files=files
                )
                if r.status_code == 400:
                    # Surface moderation refusals as themselves. This is the known
                    # failure mode for identity-preserving edits of a child's photo,
                    # and an operator needs to see it, not a generic 400.
                    try:
                        detail = (r.json().get("error") or {}).get("message", "")
                    except Exception:  # noqa: BLE001
                        detail = (r.text or "")[:300]
                    raise RuntimeError(f"OpenAI rejected the edit: {detail}")
                r.raise_for_status()
                items = r.json().get("data") or []
                if not items or not items[0].get("b64_json"):
                    raise RuntimeError("OpenAI returned no image")
                return base64.b64decode(items[0]["b64_json"])
            except RuntimeError:
                raise  # policy refusal / empty response — deterministic, don't retry
            except Exception as e:  # noqa: BLE001
                last_err = e
                body = ""
                if isinstance(e, httpx.HTTPStatusError):
                    body = (e.response.text or "")[:300]
                print(
                    f"[openai] edit attempt {attempt + 1}/{attempts} failed: {e} {body}",
                    flush=True,
                )
                if attempt < attempts - 1:
                    await asyncio.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"OpenAI image edit failed after {attempts} attempts: {last_err}")


async def _openai_faceswap(
    *,
    target_src: str,
    face_src: str,
    style_prompt: Optional[str] = None,
    face_region: Optional[dict] = None,
    is_preview: bool = False,
) -> str:
    """Personalize a child's face onto an ILLUSTRATED base page via gpt-image-1.

    Face-region crop -> /images/edits -> paste back -> feathered-mask composite.
    Returns the saved /uploads URL. See the design notes at the top of this block
    for why only the crop is sent.
    """
    plate_bytes = _image_bytes(target_src)
    face_bytes = _image_bytes(face_src)
    quality = _openai_quality(is_preview)

    cache_key = _openai_cache_key(
        plate_bytes,
        face_bytes,
        json.dumps(face_region or {}, sort_keys=True),
        style_prompt or "",
        settings.openai_image_model,
        settings.openai_image_size,
        settings.openai_input_fidelity,
        quality,
    )
    cached = _openai_cache_get(cache_key)
    if cached:
        print(f"[openai] cache hit ({quality}) -> {cached}", flush=True)
        return cached

    plate = Image.open(io.BytesIO(plate_bytes)).convert("RGB")
    box = _face_crop_box(face_region, plate.size) if face_region else None
    prompt = _openai_prompt(style_prompt)

    if box:
        crop = plate.crop(box)
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        edited = await _openai_edit_call(
            scene_png=buf.getvalue(),
            face_bytes=face_bytes,
            prompt=prompt,
            quality=quality,
        )
        new_face = (
            Image.open(io.BytesIO(edited))
            .convert("RGB")
            .resize((box[2] - box[0], box[3] - box[1]))
        )
        swapped = plate.copy()
        swapped.paste(new_face, (box[0], box[1]))
    else:
        # No authored face region — edit the whole page. Consistency then depends
        # on the model rather than on the compositor, so this is the weaker path;
        # author a face region on the page to get the guarantee back.
        buf = io.BytesIO()
        plate.save(buf, format="PNG")
        edited = await _openai_edit_call(
            scene_png=buf.getvalue(),
            face_bytes=face_bytes,
            prompt=prompt,
            quality=quality,
        )
        swapped = Image.open(io.BytesIO(edited)).convert("RGB").resize(plate.size)

    out = io.BytesIO()
    swapped.save(out, format="JPEG", quality=95)
    content = out.getvalue()

    # Same feathered mask as the Segmind path: take only the authored face oval /
    # lasso from the edit, keeping the plate's hair and everything else untouched.
    if face_region:
        try:
            content = _composite_face_region(target_src, content, face_region)
        except Exception as ce:  # noqa: BLE001
            print(f"[openai] face composite skipped: {ce}", flush=True)

    url = _save_bytes(content, prefix="page")
    _openai_cache_put(cache_key, url)
    return url


# --------------------------------------------------------------------------- #
#  Explicit per-provider personalization (used by the A/B compare endpoint)     #
# --------------------------------------------------------------------------- #

# Human labels + indicative per-image cost in USD. ADMIN-FACING ONLY — the
# storefront never sees vendor names or our unit economics.
PROVIDER_LABELS: dict[str, str] = {
    "segmind": "Segmind FaceSwap-Comic",
    "openai": "OpenAI gpt-image-1",
}

# Indicative only; the authority is each vendor's pricing page. Used to put a
# number beside each tile in the admin comparison so a quality difference can be
# judged against what it costs.
PROVIDER_EST_COST_USD: dict[str, Any] = {
    "segmind": 0.065,
    # gpt-image-1 bills per output image token, so cost tracks the quality tier.
    "openai": {"low": 0.011, "medium": 0.042, "high": 0.167},
}


def provider_est_cost(provider: str, quality: Optional[str] = None) -> Optional[float]:
    entry = PROVIDER_EST_COST_USD.get(provider)
    if isinstance(entry, dict):
        return entry.get((quality or "").lower())
    return entry


def available_providers() -> list[str]:
    """Providers that actually have a key configured, in a STABLE order.

    Stable because the storefront labels tiles "Style A"/"Style B" positionally —
    the ordering must not shuffle between requests or the labels stop meaning
    anything across two uploads.
    """
    out = []
    if current_segmind_key():
        out.append("segmind")
    if current_openai_key():
        out.append("openai")
    return out


async def personalize_with(
    provider: str,
    *,
    target_src: str,
    face_src: str,
    style_prompt: Optional[str] = None,
    face_region: Optional[dict] = None,
    seed: int = 0,
    is_preview: bool = True,
) -> str:
    """Personalize one page with a NAMED provider, ignoring the admin toggle.

    render_page() picks the provider from settings; this is the explicit form the
    comparison endpoint needs to run the same inputs through each of them. Both
    paths share the underlying implementations, so a tile in the comparison is
    the same image the pipeline would produce with that provider selected.
    """
    if provider == "segmind":
        if not current_segmind_key():
            raise RuntimeError("SEGMIND_API_KEY not set")
        return await _segmind_faceswap(
            target_src=target_src,
            face_src=face_src,
            seed=seed,
            face_region=face_region,
        )
    if provider == "openai":
        if not current_openai_key():
            raise RuntimeError("OPENAI_API_KEY not set")
        return await _openai_faceswap(
            target_src=target_src,
            face_src=face_src,
            style_prompt=style_prompt,
            face_region=face_region,
            is_preview=is_preview,
        )
    raise RuntimeError(f"Unknown image provider: {provider}")


def _is_raster(url: str) -> bool:
    """A base illustration must be a real raster to be a face-swap target.
    SVG placeholders (the demo /covers/*.svg) can't be swapped into."""
    return bool(url) and not url.split("?", 1)[0].lower().endswith(".svg")


def _replicate_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.replicate_api_token}",
        "Content-Type": "application/json",
    }


async def _replicate_post(
    client: httpx.AsyncClient, url: str, headers: dict, json: dict
) -> httpx.Response:
    """POST with patient backoff on 429 (Replicate rate limit).

    Honours Retry-After and escalates the wait so a render job rides out a
    throttle window (Replicate limits are time-bucketed) rather than failing.
    ~12 attempts across up to a few minutes; the Celery task has an hour budget.
    """
    for attempt in range(12):
        r = await client.post(url, headers=headers, json=json)
        if r.status_code != 429:
            return r
        # Exponential-ish backoff, capped at 60s, honouring any Retry-After.
        wait = float(r.headers.get("Retry-After", min(60, 3 * (attempt + 1))))
        await asyncio.sleep(min(wait, 60))
    return r  # last (still-429) response; caller raises_for_status


async def _replicate_create(
    client: httpx.AsyncClient, model: str, inp: dict, headers: dict
) -> dict:
    """Create a prediction, choosing the correct endpoint.

    Endpoint choice matters and the two kinds of model are mutually exclusive:
      * OFFICIAL models (e.g. black-forest-labs/*) run on Replicate's deployment
        infra and MUST use the model endpoint (/v1/models/owner/name/predictions);
        the versioned /v1/predictions endpoint returns "Director: unexpected
        error (E9828)" for them.
      * COMMUNITY models (fofr/*, cdingram/*, zsxkib/*) 404 on the model endpoint
        and MUST use /v1/predictions with a resolved version hash.
    So for an unpinned "owner/name" we try the model endpoint first and fall back
    to a versioned prediction on 404. A pinned "owner/name:hash" always uses the
    versioned endpoint.
    """
    wait = {**headers, "Prefer": "wait"}
    if ":" not in model:
        r = await _replicate_post(
            client,
            f"https://api.replicate.com/v1/models/{model}/predictions",
            wait,
            {"input": inp},
        )
        if r.status_code != 404:
            r.raise_for_status()
            return r.json()
        # Community model — resolve its latest version and use /v1/predictions.
        m = await client.get(
            f"https://api.replicate.com/v1/models/{model}", headers=headers
        )
        m.raise_for_status()
        version = m.json()["latest_version"]["id"]
    else:
        version = model.split(":", 1)[1]
    r = await _replicate_post(
        client,
        "https://api.replicate.com/v1/predictions",
        wait,
        {"version": version, "input": inp},
    )
    r.raise_for_status()
    return r.json()


async def _replicate_predict(
    client: httpx.AsyncClient, model: str, inp: dict, headers: dict, _retries: int = 2
) -> str:
    """Create a prediction and poll to a single output URL (up to ~8 min).

    Retries on E9828 ("Director: unexpected error") — a transient Replicate infra
    error that surfaces as a failed prediction with no real cause.
    """
    for attempt in range(_retries + 1):
        pred = await _replicate_create(client, model, inp, headers)
        get_url = pred.get("urls", {}).get("get")
        last = pred.get("status")
        for _ in range(240):  # ~8 min (face-swap models can cold-boot slowly)
            last = pred.get("status")
            if last == "succeeded":
                out = pred.get("output")
                return out[0] if isinstance(out, list) else str(out)
            if last in ("failed", "canceled"):
                err = str(pred.get("error") or "")
                if "E9828" in err and attempt < _retries:
                    await asyncio.sleep(3)
                    break  # transient — recreate the prediction
                raise RuntimeError(f"Replicate {last}: {err}")
            await asyncio.sleep(2)
            pred = (await client.get(get_url, headers=headers)).json()
        else:
            raise RuntimeError(f"Replicate render timed out (last status: {last})")
    raise RuntimeError("Replicate failed after E9828 retries")


async def _replicate_run(*, prompt: str, face_src: str, seed: int = 0) -> str:
    """Generate an identity-preserving image via a hosted PuLID-Flux model (txt2img).

    The child's face is sent inline as a data-URI (read from the shared volume),
    so no public storage / S3 is required.
    """
    model = settings.replicate_model_version or DEFAULT_REPLICATE_MODEL
    headers = _replicate_headers()
    inp = {
        "prompt": prompt,
        "main_face_image": _data_uri(face_src) if face_src else "",
        "width": GEN["width"],
        "height": GEN["height"],
        "num_steps": 20,
        "guidance_scale": 4.0,
        "id_weight": 1.0,
        "num_outputs": 1,
        "output_format": "webp",
        "seed": seed,
    }
    async with httpx.AsyncClient(timeout=300) as client:
        return await _replicate_predict(client, model, inp, headers)


async def _replicate_faceswap(
    *, target_src: str, face_src: str, prompt: str = "", seed: int = 0
) -> str:
    """Swap the child's face (`face_src`) onto a fixed base illustration
    (`target_src`) via a hosted face-swap model — true Diffrun behaviour.

    Both images are sent inline as data-URIs (read from the shared volume), so no
    public storage / S3 is required. The exact input keys are model-specific and
    resolved from `_FACESWAP_INPUTS` so we can A/B different face-swap models by
    just changing REPLICATE_FACESWAP_MODEL.
    """
    model = settings.replicate_faceswap_model or DEFAULT_FACESWAP_MODEL
    base = model.split(":", 1)[0]
    target_key, face_key, accepts_prompt = _FACESWAP_INPUTS.get(
        base, ("target_image", "character_image", True)
    )
    headers = _replicate_headers()
    inp: dict[str, Any] = {
        target_key: _data_uri(target_src),
        face_key: _data_uri(face_src),
    }
    if accepts_prompt and prompt:
        inp["prompt"] = prompt
    async with httpx.AsyncClient(timeout=300) as client:
        return await _replicate_predict(client, model, inp, headers)


async def generate_base_art(*, scene_prompt: str, seed: int = 0) -> bytes:
    """Generate a page's GENERIC base illustration once via a plain flux txt2img
    model (no specific identity). Returns raw image bytes for the admin to save
    as PageTemplate.baseImageUrl. Only runs on the replicate provider.
    """
    if settings.gpu_provider != "replicate":
        raise RuntimeError("base-art generation requires GPU_PROVIDER=replicate")
    model = settings.replicate_txt2img_model or DEFAULT_TXT2IMG_MODEL
    headers = _replicate_headers()
    inp: dict[str, Any] = {
        "prompt": scene_prompt,
        "aspect_ratio": "4:3",
        "num_outputs": 1,
        "output_format": "webp",
    }
    if seed:
        inp["seed"] = seed
    async with httpx.AsyncClient(timeout=300) as client:
        url = await _replicate_predict(client, model, inp, headers)
    return httpx.get(url, timeout=120).content


# --------------------------------------------------------------------------- #
#  Public API                                                                  #
# --------------------------------------------------------------------------- #

async def extract_identity(photo_url: str) -> Optional[list]:
    """Extract the child's face embedding ONCE. Returns a JSON-serialisable
    vector cached in Job.identityVectors and reused for every page."""
    if settings.gpu_provider == "mock":
        # Mock embedding — deterministic length-8 vector from the url.
        h = sum(ord(c) for c in (photo_url or "seed"))
        return [round(((h * (i + 3)) % 997) / 997, 4) for i in range(8)]

    if settings.gpu_provider == "runpod":
        data = await _runpod_run(
            {"mode": "extract_identity", "graph": build_identity_extract_graph(photo_url)}
        )
        embeds = (data.get("output") or {}).get("embeds")
        if embeds is None:
            raise RuntimeError(f"identity extraction returned no embeds: {data}")
        return embeds

    # comfyui / replicate: the face image is passed to each render, so there's
    # no separate cached-embedding step here.
    return None


async def render_page(
    *,
    scene_prompt: str,
    identity_vectors: Optional[list],
    face_image_name: Optional[str] = None,
    base_image: Optional[str] = None,
    base_image_url: Optional[str] = None,
    style_prompt: Optional[str] = None,
    face_region: Optional[dict] = None,
    seed: int = 0,
    is_preview: bool = False,
) -> str:
    """Render one page (no text) and return its image URL.

    `is_preview` marks a free-preview page so the OpenAI provider can render it a
    quality tier down — previews are rendered for every visitor, including those
    who never buy, so they dominate spend.

    If the page has a base illustration -> inpaint-over-template (FaceDetailer +
    PuLID): the scene is preserved and only the face is swapped to the child.
    Otherwise -> txt2img fallback.
    """
    if settings.gpu_provider == "mock":
        # Mock: reuse the bundled base illustration for the page.
        return base_image_url or base_image or "/covers/journey-to-the-stars-1.svg"

    if settings.gpu_provider == "replicate":
        # True Diffrun behaviour: if the page has a real raster base illustration,
        # personalize the child's face ONTO it (fixed scene/style/character kept =
        # page-to-page consistency). Otherwise fall back to flux-pulid txt2img.
        can_faceswap = (
            settings.replicate_mode == "faceswap"
            and _is_raster(base_image_url or "")
            and face_image_name
        )
        if can_faceswap:
            # Which service personalizes the face is an ADMIN RUNTIME toggle
            # (Settings -> Image provider), not an env var, so the two can be
            # A/B'd on the same deploy. Falls back to the env-configured
            # faceswap_provider only for the non-segmind/openai options.
            from .app_settings import image_provider

            active = image_provider()
            if active == "openai" and not current_openai_key():
                # Do NOT quietly fall through to another swapper: the admin chose
                # this provider, and a silent switch would make an A/B comparison
                # meaningless while looking like it worked.
                raise RuntimeError(
                    "Image provider is set to OpenAI but no OpenAI API key is set "
                    "(Settings -> OpenAI API key)."
                )
            if active == "openai":
                # Same contract as the segmind branch below: a page WITH base art
                # must be personalized by the swapper, so a terminal failure
                # surfaces rather than silently rendering unpersonalized art.
                return await _openai_faceswap(
                    target_src=base_image_url,  # type: ignore[arg-type]
                    face_src=face_image_name,
                    style_prompt=style_prompt,
                    face_region=face_region,
                    is_preview=is_preview,
                )
            if active == "segmind" and current_segmind_key():
                # A page WITH base art must be personalized by the swapper. Retries
                # happen INSIDE _segmind_faceswap (fresh seed each redo). We do NOT
                # fall back to txt2img or the unswapped base art here — that would
                # render an off-model page unlike the authored illustration. A
                # terminal failure surfaces instead of silently rendering wrong art.
                return await _segmind_faceswap(
                    target_src=base_image_url,  # type: ignore[arg-type]
                    face_src=face_image_name,
                    seed=seed,
                    face_region=face_region,
                )
            if settings.faceswap_provider == "replicate":
                try:
                    return await _replicate_faceswap(
                        target_src=base_image_url,  # type: ignore[arg-type]
                        face_src=face_image_name,
                        prompt=style_prompt or scene_prompt,
                        seed=seed,
                    )
                except Exception:
                    # Hosted replicate swappers are experimental — allow the
                    # txt2img fallback below so a preview still renders.
                    pass
        # txt2img identity generation (Diffrun's method): the per-page SCENE drives
        # the image and the style prompt keeps the look consistent page to page.
        # Combine both — using `style_prompt or scene_prompt` would drop the scene
        # entirely (stylePrompt always has a default), making every page identical.
        txt_prompt = ", ".join(
            p for p in [scene_prompt, style_prompt] if p and p.strip()
        ) or "children's storybook illustration"
        return await _replicate_run(
            prompt=txt_prompt,
            face_src=face_image_name or "",
            seed=seed,
        )

    # Build the graph (inpaint-over-template when a base illustration exists).
    if base_image_url:
        graph = build_inpaint_graph(
            base_image_url=base_image_url,
            style_prompt=style_prompt or scene_prompt,
            id_embeds=identity_vectors,
            face_image_name=face_image_name,
            face_region=face_region,
            seed=seed,
        )
        mode = "inpaint_page"
    else:
        graph = build_render_graph(
            scene_prompt,
            id_embeds=identity_vectors,
            face_image_name=face_image_name,
            seed=seed,
        )
        mode = "render_page"

    if settings.gpu_provider == "comfyui":
        return await _comfyui_run(graph)

    # runpod serverless
    data = await _runpod_run({"mode": mode, "graph": graph})
    output = data.get("output") or {}
    images = output.get("images") or []
    if images:
        first = images[0]
        return first.get("url") if isinstance(first, dict) else str(first)
    raise RuntimeError(f"render returned no image: {data}")
