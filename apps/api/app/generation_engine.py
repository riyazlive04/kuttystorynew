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
    """Plain base64 (no data: prefix) — Segmind's API expects raw base64.

    Normalised to sRGB on the way out. The base plates are print-authored CMYK
    JPEGs with a FOGRA39 profile; handing one to a swapper that assumes RGB is
    handing it a darker, contrastier picture than the artist drew, and the face
    it paints gets shaded to match.
    """
    from .color import open_srgb

    img = open_srgb(_image_bytes(src))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95, subsampling=0)
    return base64.b64encode(buf.getvalue()).decode()


# How much room to leave around the child's own face when cropping the SOURCE
# photo. Enough for the whole head -- the swapper reads hair, jaw and neck to
# judge what it is transplanting, and a crop tight to the eyes loses the very
# proportions that make a toddler read as a toddler -- and no more, because
# everything past that is the room he was photographed in.
SOURCE_FACE_PADDING = 0.45


def _b64_face(src: str) -> str:
    """The child's face from a holiday snap, not the holiday snap.

    An uploaded photo is a room with a child in it -- measured on a real
    upload, the face was 12.7% of the frame -- and the swapper was being handed
    all of it. What it has to work from is then a face a couple of hundred
    pixels wide inside a bed, a wardrobe and a phone, which is how a toddler
    comes back as a generic older child: there was never enough of him to copy.

    Crop to the detected face with room around it and the same request carries
    an order of magnitude more of the only thing it is being asked about. Falls
    back to the whole photo when no face is found, which is the behaviour this
    replaces.
    """
    from .color import open_srgb
    from .face_detect import detect_face_region_for

    region = detect_face_region_for(src)
    img = open_srgb(_image_bytes(src))
    if region:
        box = _face_crop_box(region, img.size, padding=SOURCE_FACE_PADDING)
        if box:
            img = img.crop(box)
            print(
                f"[segmind] source cropped to face: {img.size[0]}x{img.size[1]}",
                flush=True,
            )
    else:
        print("[segmind] no face detected in the photo; sending it whole", flush=True)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95, subsampling=0)
    return base64.b64encode(buf.getvalue()).decode()


def _save_bytes(data: bytes, prefix: str = "swap") -> str:
    """Persist raw image bytes to the shared volume, return its /uploads URL."""
    import uuid

    os.makedirs(settings.storage_dir, exist_ok=True)
    name = f"{prefix}_{uuid.uuid4().hex[:12]}.jpg"
    with open(os.path.join(settings.storage_dir, name), "wb") as f:
        f.write(data)
    return f"/uploads/{name}"


def _brow_from_region(region: dict, size):
    """Last resort: the brow line, estimated from the face region.

    A traced outline runs from the hairline to the chin, and on the plates
    measured the brows sit a little over a third of the way down it.
    """
    W, H = size
    pts = (region or {}).get("points")
    if pts and len(pts) >= 3:
        ys = [float(p[1]) / 100.0 * H for p in pts]
        top, bottom = min(ys), max(ys)
    elif region and region.get("h"):
        top = float(region["y"]) / 100.0 * H
        bottom = top + float(region["h"]) / 100.0 * H
    else:
        return None
    if bottom - top < 8:
        return None
    return {"y": top + (bottom - top) * 0.36, "span": bottom - top}


def _keep_template_hair(mask, swapped: bytes, swapped_size, template: bytes, region):
    """Take the plate's hair out of the mask, including where the mask is solid.

    `_keep_artwork_hair` guards the feathered BAND only, and deliberately so:
    the eyebrows sit deep inside the fully-swapped core, and a luminance test
    cannot tell an eyebrow from a fringe. That is enough when the region came
    from the Haar detector, which runs brow to chin and so never contained hair
    to begin with.

    A traced outline is a different shape. SAM3, and a careful hand trace,
    follow the real silhouette -- hairline, ears, chin -- which puts the fringe
    INSIDE the region at full mask strength, exactly where the band guard is
    inert. The child's own hair is then composited over the character's, and a
    photograph's hair on an illustrated head is what reads as odd: it falls the
    way the camera saw it, not the way the plate was drawn.

    The brow line settles which dark pixels are which. Above it nothing needs
    protecting -- a forehead carries no identity, and every dark pixel up there
    is hair -- so the same luminance test runs at full strength, core included.
    Below it nothing changes and the child keeps their own brows.
    """
    try:
        import numpy as np

        from .app_settings import keep_template_above_brows
        from .face_landmarks import brow_line

        if not keep_template_above_brows():
            # The child's own hair, exactly as the swapper drew it. Nothing
            # above the brows is taken back.
            #
            # This branch used to run the luminance test instead, which is not
            # an option anybody would choose: it returned the plate's hair
            # where the plate was dark and the child's where the plate's
            # forehead was bare, so a page came back as the plate's hairstyle
            # with the child's fringe hanging in front of it -- both answers at
            # once, and the complaint that started all of this. The feathered
            # band guard still runs below, because crossfading two hair
            # renderings is a different problem and still worth avoiding.
            print("[retouch] hair guard: hair=child, mask left as traced",
                  flush=True)
            return mask

        H = mask.size[1]
        # The swap first, because that is the face the mask is being cut for,
        # then the plate, which shares the composition, then the region itself.
        brow = brow_line(swapped)
        if brow and swapped_size and swapped_size[1]:
            brow = {"y": brow["y"] * H / swapped_size[1],
                    "span": brow["span"] * H / swapped_size[1]}
        else:
            brow = brow_line(template)
            tmpl_size = _decoded_size(template)
            if brow and tmpl_size and tmpl_size[1]:
                brow = {"y": brow["y"] * H / tmpl_size[1],
                        "span": brow["span"] * H / tmpl_size[1]}
            else:
                brow = None
        if not brow:
            brow = _brow_from_region(region, mask.size)
        if not brow:
            print("[retouch] hair guard: no brow line found by any method", flush=True)
            return mask

        m = np.asarray(mask, dtype=np.float32) / 255.0
        ys_all = np.arange(mask.size[1], dtype=np.float32)[:, None]

        # A soft cut at the brows rather than a straight one: a hard line across
        # a forehead is itself an artifact, and the brows are not perfectly
        # level on a tilted head.
        ramp = max(4.0, brow["span"] * 0.08)
        above = np.clip((brow["y"] - ys_all) / ramp, 0.0, 1.0)

        # Above the brows the plate wins outright, whatever it looks like
        # there. Asking whether the PLATE has hair at a spot answers the wrong
        # question: the fringe is the CHILD's, and it falls where their hair
        # falls, most often on a forehead the artist drew bare.
        out = m * (1.0 - above)
        # Say what it did. Whether the fringe on a finished page is the plate's
        # or the child's is the one thing that cannot be read back off the
        # image afterwards, and a guard that silently does nothing looks
        # exactly like a guard that was never deployed.
        removed = float((m - out).sum()) / max(1.0, float(m.sum())) * 100.0
        print(
            f"[retouch] hair guard: hair=plate, brow at y={brow['y']:.0f}, "
            f"above-brow {float((m * above).sum()) / max(1.0, float(m.sum())) * 100.0:.1f}%, "
            f"took back {removed:.1f}% of the mask",
            flush=True,
        )
        return Image.fromarray(np.clip(out * 255.0, 0, 255).astype("uint8"), "L")
    except Exception as e:  # noqa: BLE001 -- a fringe is not worth a failed page
        print(f"[retouch] template hair guard skipped: {e}", flush=True)
        return mask


def _keep_artwork_hair(template: Image.Image, mask: Image.Image) -> Image.Image:
    """Take the plate's hair out of the blend, so it is never averaged with the
    swapper's.

    The reported symptom is hair "going one direction, then some areas showing a
    conflicting direction", and that is literally what a crossfade of two hair
    renderings produces: the artwork's strands and the swapper's own strands, at
    roughly 50/50 through the middle of the feather, each drawn at its own angle.
    Measured on a real render, 17% of the feathered band sat on the plate's hair.

    Skin blends fine -- two versions of a cheek average into a cheek. Hair does
    not, because its detail IS direction.

    So wherever the plate is much darker than the face's own skin, the mask is
    pulled toward zero and the artwork keeps its pixels. Two things make that
    safe to do without any geometry:

      * it applies only where the mask is PARTIAL. The eyebrows measure 83px
        inside the fully-swapped core on a real plate, so they are never
        touched and the child keeps their own brows.
      * the threshold is relative to the median skin luminance INSIDE the face,
        so it follows the plate's own lighting instead of a fixed number that
        would call a dark-skinned child's cheek "hair".

    The ramp on both edges -- soft between hair and skin, soft between band and
    core -- is what stops removing an edge from drawing one.
    """
    try:
        import numpy as np

        m = np.asarray(mask, dtype=np.float32) / 255.0
        core = m > 0.99
        if not core.any():
            return mask
        lum = np.asarray(template.convert("L"), dtype=np.float32)
        skin = float(np.median(lum[core]))
        lo, hi = skin * 0.45, skin * 0.70
        keep = np.clip((lum - lo) / max(1e-3, hi - lo), 0.0, 1.0)  # 0 hair, 1 skin
        strength = np.clip((1.0 - m) / 0.25, 0.0, 1.0)  # 0 in the core, 1 in the band
        out = m * (1.0 - strength * (1.0 - keep))
        return Image.fromarray(
            np.clip(out * 255.0, 0, 255).astype("uint8"), "L"
        )
    except Exception as e:  # noqa: BLE001 -- a softer hairline is not worth a failed page
        print(f"[composite] hair guard skipped: {e}", flush=True)
        return mask


# How hard to steepen the mask's edge when the CHILD's hair is being kept.
# 1.0 leaves the feather as it is; higher pushes the band toward fully-in or
# fully-out. High values stop the half of the band that lies on background from
# averaging a wall into the child's hair -- that is what drew the pale rim
# around the silhouette.
EDGE_CONTRAST = 10.0

# ...but the same steepening along the FRONT hairline is what makes the hair sit
# on the head like a moulded cap. The two edges are not the same problem:
#
#   side/top  -- hair meets background. Any blending there is a visible halo,
#                so it wants the full EDGE_CONTRAST.
#   front     -- hair meets the child's own forehead. Both sides of that edge
#                are the child, there is no wall to leak in, and a real hairline
#                is soft: individual strands, not a stencil cut.
#
# Steepening the front edge buys nothing (no background to exclude) and costs
# the thing that makes a hairline read as hair. So the contrast is chosen per
# pixel by what lies OUTSIDE the mask there -- skin or not.
EDGE_CONTRAST_SKIN = 1.6

# Sparkle removal inside the hair. Thresholds are relative to each speck's own
# surroundings, measured on the space-explorer plate (hair lum 30, specks 116
# median / 247 max). The size caps are what keep an eye catchlight safe; they
# are given for a 1200px page and scaled up for a print plate.
HAIR_SPECK_MAX_BG = 90.0    # local background must be this dark to count as hair
HAIR_SPECK_MIN_LIFT = 22.0  # how far above its background a dot must sit
HAIR_SPECK_MAX_AREA = 28    # px, at 1200px wide -- a sparkle, not a highlight
HAIR_SPECK_MAX_SIDE = 8     # px, at 1200px wide -- bounding box limit
# How much of the neighbourhood must itself be dark before a dot counts as
# being "in hair". An eyelash is a dark thread on lit skin and scores low; the
# inside of a head of hair scores near 1.
# 0.85 measured on the space-explorer plate: at 0.75 the filter still took 24px
# of eyebrow, at 0.85 both eye boxes drop to zero while the hair still loses
# 1243px of sparkle. Eyes before sparkles, every time.
HAIR_SPECK_MIN_DENSITY = 0.85

# The template child's hair tips, stranded on the background outside the traced
# outline. Measured on speed-racer p2: 12 blobs, 261px, all 0% inside the hair's
# convex hull, while every eye and eyebrow scored 100% inside it.
HAIR_TIP_DARK = 70.0             # what counts as "hair dark" when finding the mass
HAIR_TIP_DARKER_THAN_BG = 40.0   # a stray tip is this much darker than its surround
HAIR_TIP_BLOB_MAX_AREA = 600     # px at 800px wide -- a tip, not a drawn object


def _harden_hair_edge(template: Image.Image, mask: Image.Image) -> Image.Image:
    """Stop the blend band crossfading the child's hair with the artwork's.

    The mirror of `_keep_artwork_hair`, for the case where the CHILD's hair is
    the one being kept. Same detection -- the plate much darker than the face's
    own skin is hair -- and the same two safeguards: it acts only on the partial
    band, never the core where the brows sit, and the threshold is relative to
    the skin inside the face, so it follows the plate's lighting rather than a
    fixed number.

    Where that band falls on hair the mask is pushed to 1 instead of toward 0,
    so the child's hair is taken whole rather than averaged. A 50/50 average of
    two hair drawings is what reads as a translucent patch beside the temple;
    hair has to come from one source or the other, and here it is the child's.
    Skin is left alone -- two versions of a cheek average into a cheek.
    """
    try:
        import cv2
        import numpy as np

        m = np.asarray(mask, dtype=np.float32) / 255.0
        core = m > 0.99
        band = (m > 0.02) & (m < 0.99)
        if not core.any() or not band.any():
            return mask
        lum = np.asarray(template.convert("L"), dtype=np.float32)
        skin = float(np.median(lum[core]))
        lo, hi = skin * 0.45, skin * 0.70
        is_hair = 1.0 - np.clip((lum - lo) / max(1e-3, hi - lo), 0.0, 1.0)

        # Strands are not solid: a spiky fringe is dark hair interleaved with the
        # background behind it, so testing a single pixel finds a gap as often as
        # a strand and the band keeps half of them. Blur the test instead, so the
        # whole fringe counts as hair rather than only the strands that happen to
        # be opaque -- otherwise the plate's spikes come through in a ring around
        # the hairline, which is exactly where the complaint was.
        is_hair = cv2.GaussianBlur(is_hair.astype(np.float32), (0, 0), 9)
        is_hair = np.clip(is_hair * 1.8, 0.0, 1.0)

        # ...and darkness is not the whole test. On speed-racer the outer strands
        # are pale straw against a warm wall, lighter than the skin they are
        # measured against, so they score 0 on the luminance test and the band
        # kept blending them -- the last of the "transparency" by the hairline.
        #
        # The traced outline already IS the hair boundary: it was measured on the
        # plate, and an overlay confirms the spikes sit inside it. So inside that
        # outline there is nothing to protect and no reason to feather -- whatever
        # the plate has there is hair the child's own replaces. Take the whole
        # inner band, and let the luminance test speak only for the rim beyond it.
        inner = cv2.GaussianBlur((m > 0.25).astype(np.float32), (0, 0), 3)
        is_hair = np.maximum(is_hair, inner)

        # Which edge is this? Along the front hairline the plate just outside the
        # mask is the character's forehead; along the sides and top it is the
        # room behind them. Luminance alone cannot tell those apart -- a sunlit
        # wall and a lit forehead sit at the same brightness, which is why the
        # earlier pass hardened both -- so ask Lab: skin holds a warm a*/b*, the
        # pastel walls in these plates do not.
        lab = cv2.cvtColor(np.asarray(template.convert("RGB")), cv2.COLOR_RGB2LAB)
        a_ch = lab[:, :, 1].astype(np.float32)
        b_ch = lab[:, :, 2].astype(np.float32)
        sA = float(np.median(a_ch[core]))
        sB = float(np.median(b_ch[core]))
        # Distance from the face's OWN skin colour, so it follows the plate's
        # palette rather than a fixed notion of what skin looks like.
        dist = np.hypot(a_ch - sA, b_ch - sB)
        is_skin = 1.0 - np.clip((dist - 6.0) / 14.0, 0.0, 1.0)
        # Reject the hair itself, which shares the warm cast in these drawings.
        # The gate has to sit LOW: measured on the-dinosaur-egg plate, the strip
        # of forehead under the fringe -- the exact pixels that must stay soft --
        # reads lum 95 against a face median of 140, because it is in the
        # fringe's shadow. A gate at 0.72*skin scored it 0.00 and hardened the
        # hairline, which is the moulded-cap edge. Hair there is 8-15, so 0.35
        # separates them with room to spare and the colour test does the work.
        is_skin *= np.clip((lum - skin * 0.35) / max(1e-3, skin * 0.25), 0.0, 1.0)
        # Judge the neighbourhood, not the pixel: at the hairline every other
        # pixel is a strand, and a per-pixel test would alternate hard and soft
        # along the very edge it is meant to keep smooth.
        is_skin = cv2.GaussianBlur(is_skin.astype(np.float32), (0, 0), 7)

        # ONLY the partial band. `1 - m` is 1 across the whole page outside the
        # face, so weighting by it pulled the entire plate into the mask wherever
        # it was dark -- the log said "hardened 7765% of the mask", which is the
        # shape of that bug rather than a hairline. The band is where m is
        # strictly between 0 and 1; everything else keeps the value it has.
        in_band = band.astype(np.float32)
        out = np.clip(m + (1.0 - m) * is_hair * in_band, 0.0, 1.0)

        # The other half of the problem: measured on speed-racer p1 the feather
        # is 27px wide and only 25% of it lands on the plate's hair -- the rest
        # is wall. Softly averaging the child's hair into a wall is what draws
        # the pale rim around the silhouette, and no amount of pushing the mask
        # UP fixes it, because the fault is the half that stays partial.
        #
        # So steepen the band instead of widening or narrowing it: pull values
        # below the midpoint down toward 0 and above it up toward 1. The edge
        # keeps a soft pixel or two -- enough that it is not a cut-out -- but
        # stops carrying 50% of a wall into the hair.
        # Full contrast against background, gentle against skin, blended in
        # between so there is no seam where one regime becomes the other.
        contrast = EDGE_CONTRAST + (EDGE_CONTRAST_SKIN - EDGE_CONTRAST) * is_skin
        out = np.clip((out - 0.5) * contrast + 0.5, 0.0, 1.0)
        out = np.where(band, out, m)  # outside the band nothing moves

        hardened = float(np.abs(out - m).sum()) / max(1.0, float(band.sum())) * 100.0
        soft = float((is_skin[band] > 0.5).mean()) * 100.0 if band.any() else 0.0
        print(
            f"[retouch] hair edge: hair=child, hardened {hardened:.1f}% of the mask, "
            f"{soft:.0f}% of the band kept soft (hairline against skin)",
            flush=True,
        )
        return Image.fromarray(np.clip(out * 255.0, 0, 255).astype("uint8"), "L")
    except Exception as e:  # noqa: BLE001 -- a hairline is not worth a failed page
        print(f"[retouch] hair edge skipped: {e}", flush=True)
        return mask


def _despeckle_hair(img: Image.Image, mask: Image.Image) -> Image.Image:
    """Remove the artwork's sparkle layer from the hair, and nowhere else.

    The plates are painted with a scatter of tiny white dots. On a starry
    Space Explorer page the effect is deliberate -- the night sky through the
    window, the galaxy poster -- but the same layer lies over the child's hair,
    where it reads as glitter or dandruff rather than as stars.

    Three constraints, each one measured rather than guessed, and each one
    there because dropping it did visible damage in testing:

    1. ONLY inside the face/hair mask. Run page-wide, the identical filter
       stripped the window's starfield down to a few lonely dots -- the sky in
       a space book. The mask is the whole safeguard; there is no attempt to
       find hair anywhere else on the page.
    2. ONLY where the LOCAL background is dark. A speck is defined against its
       own surroundings, so this follows the plate's lighting instead of a
       fixed threshold, and it cannot fire on a lit forehead or a white collar.
    3. ONLY tiny, isolated blobs. A sparkle is a few pixels; an eye catchlight
       is bigger and brighter. A speck remover destroyed a child's eye on this
       codebase once before, which is why the size cap is hard and low.

    Measured on the space-explorer plate: hair sits at luminance 30 and the
    specks at 116 median / 247 max, so they separate cleanly.
    """
    if not settings.hair_despeckle_enabled:
        return img
    try:
        import cv2
        import numpy as np

        rgb = np.asarray(img.convert("RGB"))
        lum = np.asarray(img.convert("L"), dtype=np.float32)
        m = np.asarray(mask.convert("L"), dtype=np.float32) / 255.0
        inside = m > 0.5
        if not inside.any():
            return img

        bg = cv2.medianBlur(lum.astype(np.uint8), 9).astype(np.float32)
        dark = bg < HAIR_SPECK_MAX_BG
        bright = (lum - bg) > HAIR_SPECK_MIN_LIFT

        # Hair only -- the face is excluded outright. Measured on the
        # space-explorer plate, the mask-plus-darkness test alone still reached
        # 135px of eyelash: lashes are thin and dark, which is exactly the
        # signature being hunted. No sparkle is worth a filter that can touch an
        # eye, so anything that is not a solid block of dark is dropped. Hair is
        # a large connected dark mass; a lash is a thread against lit skin, so
        # requiring the neighbourhood to be MOSTLY dark separates them.
        hairish = cv2.GaussianBlur((bg < HAIR_SPECK_MAX_BG).astype(np.float32), (0, 0), 9)
        cand = (dark & bright & inside & (hairish > HAIR_SPECK_MIN_DENSITY)).astype(np.uint8)
        if not cand.any():
            return img

        # Scale the size cap with the plate: a 2482px print page carries bigger
        # sparkles than a 1200px preview, and a fixed pixel count would clear
        # one and miss the other.
        scale = max(1.0, max(rgb.shape[:2]) / 1200.0)
        max_area = int(HAIR_SPECK_MAX_AREA * scale * scale)
        max_side = int(HAIR_SPECK_MAX_SIDE * scale)

        n, lab, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
        keep = np.zeros_like(cand)
        for i in range(1, n):
            a = stats[i, cv2.CC_STAT_AREA]
            w = stats[i, cv2.CC_STAT_WIDTH]
            h = stats[i, cv2.CC_STAT_HEIGHT]
            if a <= max_area and w <= max_side and h <= max_side:
                keep[lab == i] = 1
        if not keep.any():
            return img

        k = cv2.dilate(keep, np.ones((3, 3), np.uint8))
        fixed = cv2.inpaint(rgb, k, 3, cv2.INPAINT_TELEA)
        print(
            f"[retouch] hair despeckle: removed {int(keep.sum())} sparkle px "
            f"inside the face region",
            flush=True,
        )
        return Image.fromarray(fixed, "RGB")
    except Exception as e:  # noqa: BLE001 -- sparkles are not worth a failed page
        print(f"[retouch] hair despeckle skipped: {e}", flush=True)
        return img


def _remove_template_hair_tips(img: Image.Image, mask: Image.Image) -> Image.Image:
    """Erase the TEMPLATE child's hair tips left stranded on the background.

    The traced outline is the shape of the template's head. When the real
    child's hair is a different shape -- usually fuller -- the template's spiky
    tips stick out past the outline, nothing is composited over them, and they
    survive as dark flecks floating on the wall beside the new hair. They read
    as dirt, and they are the previous child's hair on this child's page.

    The guard is geometric, because colour could not do it. A dark blob on a
    light surround describes a stray tip and an EYE equally well, and a first
    version selected both eyes and both eyebrows; a Lab test against skin did
    not separate them either, since the shadowed skin around an eye sits far
    from the median skin tone.

    What does separate them is the convex hull of the hair mass -- the head's
    outer shape. Eyes and brows are inside it; stranded tips are outside it.
    Measured on speed-racer p2 the split is absolute: every facial feature
    scored 100% inside, every stray tip 0%.

    Only blobs that are (a) outside the hull, (b) small, (c) clearly darker
    than their own local background and (d) close to the hair are touched, so
    nothing in the open artwork can be reached.
    """
    if not settings.hair_tip_cleanup_enabled:
        return img
    try:
        import cv2
        import numpy as np

        rgb = np.asarray(img.convert("RGB"))
        lum = np.asarray(img.convert("L"), dtype=np.float32)
        m = np.asarray(mask.convert("L"), dtype=np.float32) / 255.0

        # The hair mass: the biggest dark component that the face region covers.
        dark = ((lum < HAIR_TIP_DARK) & (m > 0.02)).astype(np.uint8)
        if not dark.any():
            return img
        n, lab, st, _ = cv2.connectedComponentsWithStats(dark, 8)
        if n < 2:
            return img
        i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        hair = lab == i
        if hair.sum() < 400:
            return img

        cnts, _ = cv2.findContours(
            hair.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if not cnts:
            return img
        hull = cv2.convexHull(np.vstack(cnts))
        in_hull = np.zeros(lum.shape, np.uint8)
        cv2.fillConvexPoly(in_hull, hull, 1)

        scale = max(1.0, max(rgb.shape[:2]) / 800.0)
        reach = max(3, int(51 * scale)) | 1
        near = cv2.dilate(hair.astype(np.uint8), np.ones((reach, reach), np.uint8)) > 0
        bg = cv2.medianBlur(lum.astype(np.uint8), 31).astype(np.float32)

        cand = (((bg - lum) > HAIR_TIP_DARKER_THAN_BG) & (in_hull == 0) & near).astype(
            np.uint8
        )
        if not cand.any():
            return img

        tn, tlab, tst, _ = cv2.connectedComponentsWithStats(cand, 8)
        keep = np.zeros(lum.shape, np.uint8)
        lo = max(3, int(3 * scale * scale))
        hi = int(HAIR_TIP_BLOB_MAX_AREA * scale * scale)
        for k in range(1, tn):
            a = tst[k, cv2.CC_STAT_AREA]
            if lo <= a <= hi:
                keep[tlab == k] = 1
        if not keep.any():
            return img

        kk = cv2.dilate(keep, np.ones((3, 3), np.uint8))
        fixed = cv2.inpaint(rgb, kk, 3, cv2.INPAINT_TELEA)
        print(
            f"[retouch] template hair tips: removed {int(keep.sum())} px "
            f"stranded outside the hair",
            flush=True,
        )
        return Image.fromarray(fixed, "RGB")
    except Exception as e:  # noqa: BLE001 -- stray flecks are not worth a failed page
        print(f"[retouch] template hair tips skipped: {e}", flush=True)
        return img


def _keep_template_forehead(mask, swapped: bytes, swapped_size, template: bytes, region: dict):
    """Take the lower forehead from the TEMPLATE, not from the swap.

    faceswap-comic invents a bindi on Indian-looking children whether or not the
    uploaded photo has one. Nothing the API exposes prevents it -- verified on a
    plate that marks reliably, across face_strength 0.85/0.95/1.0, style_strength
    0.7/0.45/0.25/0.1 and three seeds; the dot came back every time, and none of
    the source photos has one.

    It is done WITHOUT deciding whether a mark is present, because that decision
    could not be made reliably. Five ways of asking "is there a bindi here" were
    measured against real plates -- redness against surrounding skin, darkness on
    the midline, Lab distance, the same against the template's own glabella, and
    a pixel-registered difference between swap and template -- and every one of
    them scored clean faces as high as marked ones. Two faces of different
    children differ everywhere; a small red dot does not stand out from that.

    So the patch is unconditional, which is safe because of what it is: the same
    artwork, under the same light, at a spot that carries no identity at all --
    a face is recognised by eyes, nose, mouth and jaw. On a page with no
    invented mark it changes nothing a reader can see.

    The location comes from a landmark mesh (face_landmarks), which found the
    face on all 29 illustrated plates tested. Two earlier versions got the place
    wrong and are worth recording: one estimated it from Haar eye boxes and
    pasted hair onto a child's forehead, and one centred on the glabella
    landmark alone, which sits at the top of the nose bridge -- about a third of
    an eye span BELOW where the mark actually lands.
    """
    from .face_landmarks import forehead_spot

    # Where the mark is. The swap first -- that is where it was drawn -- then the
    # artwork, which shares the composition, then the face region itself. A
    # missing landmark used to mean no patch at all, and so a bindi on the page.
    point = _scaled(forehead_spot(swapped), swapped_size, mask.size)
    if not point:
        point = _scaled(forehead_spot(template), _decoded_size(template), mask.size)
    if not point:
        point = _forehead_from_region(region, mask.size)
    if not point:
        print("[retouch] forehead patch: no face found by any method", flush=True)
        return mask
    return _subtract_spots(mask, [point], settings.forehead_patch)


def _keep_template_ears(mask, swapped: bytes, swapped_size, template: bytes):
    """Take both ears from the TEMPLATE, never from the swap."""
    from .face_landmarks import ear_spots

    spots = ear_spots(swapped)
    size = swapped_size
    if not spots:
        spots, size = ear_spots(template), _decoded_size(template)
    if not spots:
        return mask
    return _subtract_spots(mask, [_scaled(p, size, mask.size) for p in spots], 1.0)


def _decoded_size(data: bytes):
    return Image.open(io.BytesIO(data)).size


def _scaled(point, from_size, to_size):
    """Landmark pixels are in the image they were found on; the mask may be a
    different size -- the swapper answers ~1024px for a 2482px plate. Unscaled,
    the forehead patch landed up and left of the forehead and the bindi stayed."""
    if not point or not from_size or not from_size[0] or not from_size[1]:
        return point
    sx, sy = to_size[0] / from_size[0], to_size[1] / from_size[1]
    return {"x": point["x"] * sx, "y": point["y"] * sy,
            "rx": point["rx"] * sx, "ry": point["ry"] * sy}


def _forehead_from_region(region: dict, size):
    """Last resort: the lower forehead, estimated from the face region."""
    W, H = size
    pts = (region or {}).get("points")
    if pts and len(pts) >= 3:
        xs = [float(p[0]) for p in pts]
        ys = [float(p[1]) for p in pts]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        cy = y0 + (y1 - y0) * 0.30  # a traced outline starts at the hairline
    elif (region or {}).get("w") and region.get("h"):
        x0, y0 = float(region["x"]), float(region["y"])
        x1, y1 = x0 + float(region["w"]), y0 + float(region["h"])
        cy = y0 + (y1 - y0) * 0.05  # a detected box starts at the brows
    else:
        return None
    w, h = (x1 - x0) / 100 * W, (y1 - y0) / 100 * H
    return {"x": (x0 + x1) / 200 * W, "y": cy / 100 * H, "rx": w * 0.14, "ry": h * 0.09}


def _subtract_spots(mask, spots, scale: float):
    """Punch soft-edged ellipses out of the mask, so the template shows there."""
    from PIL import ImageChops

    patch = Image.new("L", mask.size, 0)
    draw = ImageDraw.Draw(patch)
    biggest = 4.0
    for point in spots:
        if not point:
            continue
        rx = max(4.0, point["rx"] * scale)
        ry = max(4.0, point["ry"] * scale)
        biggest = max(biggest, rx)
        draw.ellipse(
            [point["x"] - rx, point["y"] - ry, point["x"] + rx, point["y"] + ry], fill=255
        )
    patch = patch.filter(ImageFilter.GaussianBlur(radius=max(2.0, biggest * 0.3)))
    return ImageChops.subtract(mask, patch)


def _composite_face_region(template_src: str, swapped: bytes, region: dict) -> bytes:
    """Retain the template's HAIR by pasting only the FACE area from the fully
    swapped image back onto the original template.

    Segmind swaps the whole head (face + hair). We take just the authored face
    area from the swap and composite it over the untouched template — so:
    template hair/body + child's swapped face. `region` is either a freeform
    polygon {"points": [[x%,y%], ...]} (preferred) or a box {x,y,w,h} in PERCENT.
    """
    from .color import open_srgb

    tmpl_bytes = _image_bytes(template_src)
    tmpl = open_srgb(tmpl_bytes)
    swp = open_srgb(swapped)
    swapped_size = swp.size
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
    #
    # Narrow, and scaled to the FACE rather than to the page. Two percent of the
    # page is a 24px blur on a 1200px plate, and a Gaussian that wide spreads its
    # transition about +/-2r -- across a 213px-wide face oval that left only 34%
    # of it fully swapped. At the eye line, 202 of the 296 pixels it touched were
    # a BLEND of the child's face and the illustrated character's.
    #
    # Two faces at 50% each is a double exposure, and the illustration's eyes are
    # not where the child's are: its lower lash line lands under the child's eye
    # and reads as a dark line, its brow lands beside the child's and reads as a
    # doubled brow. That is the "black lines below the eyes" on a finished book.
    #
    # The feather only has to hide a seam, which takes a few pixels, not a third
    # of the face. At 3% of the region's span the eyes, nose and mouth are all
    # inside the fully-swapped core and only the rim blends.
    # The ceiling has to scale with the plate, not sit at a fixed pixel count.
    # These are print plates: 2482px square, where a traced face spans 400-600px
    # and 3% of it is 13-19px. A flat 16px cap silently clipped the widest faces
    # back to 2.6% -- measured on the-dinosaur-egg p2, span 621px wanting 18.6px
    # and getting 16 -- and a transition that narrow on a plate this size is a
    # visible line down the temple rather than a blend.
    span = max(cw, ch)
    bbox = mask.getbbox()
    if bbox:
        span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    mask = mask.filter(
        ImageFilter.GaussianBlur(radius=max(3.0, min(span * 0.03, max(cw, ch) * 0.012)))
    )
    # After the feather, not before: the feather is wide enough to fill a hole
    # this small straight back in, which is why an earlier version left the
    # bindi on the page. The patch carries its own soft edge instead.
    if settings.forehead_patch > 0:
        try:
            mask = _keep_template_forehead(
                mask, swapped, swapped_size, tmpl_bytes, region
            )
        except Exception as e:  # noqa: BLE001 -- never worth a failed page
            print(f"[retouch] forehead patch skipped: {e}", flush=True)
    # The swapper's ears are never used: it redraws them and decorates them (an
    # earring stud on a boy who has none). Take the artwork's; the skin match
    # below recolours them to the child's tone.
    if settings.keep_artwork_ears:
        try:
            mask = _keep_template_ears(mask, swapped, swapped_size, tmpl_bytes)
        except Exception as e:  # noqa: BLE001
            print(f"[retouch] ear patch skipped: {e}", flush=True)

    if settings.keep_artwork_hair:
        # Above the brows first, where a traced outline puts the fringe inside
        # the solid core, then the feathered band, where two hair renderings
        # would otherwise be crossfaded. Different problems, different halves
        # of the mask; the band guard cannot reach the core and is not meant to.
        mask = _keep_template_hair(mask, swapped, swapped_size, tmpl_bytes, region)
        mask = _keep_artwork_hair(tmpl, mask)
    else:
        # Keeping the CHILD's hair does not mean the band can be left to blend:
        # it still averages their hair with the plate's, which is the translucent
        # patch beside the temple. Same detection, opposite direction -- take the
        # child's hair whole instead of half.
        mask = _harden_hair_edge(tmpl, mask)
    out = Image.composite(swp, tmpl, mask)  # swap inside region, template outside
    out = _despeckle_hair(out, mask)
    out = _remove_template_hair_tips(out, mask)

    # Every stage, side by side, when asked. Which image a fringe came from is
    # invisible in the finished page -- the plate and the swap are the only two
    # candidates, and looking at all four settles it in seconds.
    if settings.debug_render_stages:
        try:
            import io as _io

            def _stage(img, tag):
                b = _io.BytesIO()
                img.convert("RGB").save(b, format="JPEG", quality=92)
                return _save_bytes(b.getvalue(), f"stage_{tag}")

            print(
                "[stages] plate=%s swap=%s mask=%s result=%s"
                % (
                    _stage(tmpl, "1plate"),
                    _stage(swp, "2swap"),
                    _stage(mask, "3mask"),
                    _stage(out, "4result"),
                ),
                flush=True,
            )
        except Exception as e:  # noqa: BLE001 -- debugging must not fail a page
            print(f"[stages] skipped: {e}", flush=True)
    # The artwork's ears and neck stay the illustrated child's skin tone; move
    # them to the swapped face's, or the face reads as a mask on a pale head.
    if settings.match_surrounding_skin:
        from .skin_tone import match_surrounding_skin

        out = match_surrounding_skin(tmpl, out, mask)
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# How far a pixel's colour may sit from the face's own skin and still count as
# skin, in Lab a/b units: full strength to NEAR, fading to nothing at FAR.
#
# A hard cutoff at 14 was leaving the worst of the marks untouched. Measured on
# a page that still showed them: of the dark skin inside the face, 7538 pixels
# sat between 14 and 25 and were refused -- deep shade pulls a skin tone's
# chroma away from the lit skin it is measured against, so the darker the
# blotch the more likely it was to fail the very test meant to find it. Fading
# out instead of cutting off recovers them without letting hair (chroma 25+)
# in.
# Widened again after the marks were still visible at 14/26: measured on that
# page, 3321 dark pixels sat at chroma 26-40 with a median L of 74 -- shading
# deep enough to read as a smudge, and still refused. Hair and eyes sit past
# 40 at a median L of 18, so there is room to reach the first without touching
# the second.
SKIN_CHROMA_NEAR = 18.0
SKIN_CHROMA_FAR = 32.0

# Brightness floor, as a fraction of the face's own skin. Anything below is
# too dark to be shaded skin -- it is a pupil, a nostril or hair.
SKIN_DARK_FLOOR = 0.30


# Speck removal, on the finished page.
#
# The swapper leaves small dark marks on otherwise clean skin -- measured on a
# real render: 29 of them across the chin, cheeks and nose, each about half the
# brightness of the skin around it (luma ~55 against ~111). On a printed page
# they read as dirt on the child's face.
#
# What makes them safe to remove is that a face's real dark parts -- hair,
# brows, lashes, pupils, nostrils, the line of the mouth -- are LARGE connected
# regions, and these are not: the same measurement found 10 large regions and
# 29 specks of 60px or less. So the rule is size, not darkness, and the
# features every face needs are never candidates.
#
# Each speck is filled from the skin immediately around it (inpainting), so the
# result follows the face's own shading instead of flattening it.

# A dark region this size or smaller, on skin, is an artefact rather than a
# feature. Measured across two real renders: the marks run from a few pixels up
# to ~1000 (a patch 52x32 on a cheek), while hair and the eye sockets come back
# as single regions of 35,000-60,000. There is three orders of magnitude between
# the two, so this sits well clear of both.
SPECK_MAX_AREA = 1400

# How much darker than the surrounding skin a region must be to count. The
# marks measured 46-86 against skin at 133, i.e. 35-65% of it; a brow or a
# lash clump is darker still and far too large to qualify on area anyway.
SPECK_DARK_RATIO = 0.78


def _even_skin_shading(data: bytes, region: dict, strength: float) -> bytes:
    """Lift the swapper's dark blotches toward the face's own skin tone.

    The marks left on cheeks, beside the nose and under the eyes are SHADING:
    smooth, low-frequency and the same hue as the skin they sit on. That is
    what makes them safe to treat, and it is the opposite of the approach that
    had to be abandoned -- nothing is cut out or filled in, so there is no
    region to misidentify and no eye to lose.

    Three things keep it to skin. Only pixels whose CHROMA matches the face's
    own are touched, so hair, eyes and the painted background are excluded by
    colour. Only the BLURRED component is measured, so lashes, brows and the
    line of the mouth are invisible to it. And the correction only ever adds
    light, so a well-lit face comes back unchanged.
    """
    if not region or strength <= 0:
        return data
    try:
        import cv2
        import numpy as np

        from .color import open_srgb

        img = open_srgb(data).convert("RGB")
        W, H = img.size
        bounds = _region_bounds_pct(region)
        if not bounds:
            return data
        bx, by, bw, bh = bounds
        x0, y0 = max(0, int(bx / 100 * W)), max(0, int(by / 100 * H))
        x1, y1 = min(W, int((bx + bw) / 100 * W)), min(H, int((by + bh) / 100 * H))
        if x1 - x0 < 16 or y1 - y0 < 16:
            return data

        rgb = np.array(img, dtype=np.float32)
        face = rgb[y0:y1, x0:x1]
        lab = cv2.cvtColor(face.astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
        L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]

        # The face's own skin, measured from the middle of the region where the
        # cheeks and nose are -- not the edges, which hold hair and background.
        fh, fw = L.shape
        mid = (slice(int(fh * 0.35), int(fh * 0.85)), slice(int(fw * 0.25), int(fw * 0.75)))
        sL, sA, sB = (float(np.median(c[mid])) for c in (L, A, B))
        if sL <= 0:
            return data

        chroma = np.hypot(A - sA, B - sB)
        skin = np.clip(
            (SKIN_CHROMA_FAR - chroma) / (SKIN_CHROMA_FAR - SKIN_CHROMA_NEAR), 0.0, 1.0
        ) * (L > sL * SKIN_DARK_FLOOR)
        skin = cv2.GaussianBlur(skin.astype(np.float32), (0, 0), 4)  # no hard edge
        low = cv2.GaussianBlur(L, (0, 0), 12)  # shading only; detail untouched
        # Lift toward the skin tone, never past it. Without the ceiling a
        # strength above 1 overshoots: the deeper the shadow the further it is
        # pushed, so the darkest patches land ABOVE the surrounding skin and the
        # marks come back inverted -- bleached blotches on the forehead, beside
        # the nose and across both cheeks, which is how it was first spotted.
        # `strength` now decides how fully a shadow is closed, not how far it
        # travels, so 1.0 means "all the way to the skin tone" and no more.
        deficit = np.clip(sL - low, 0, None)
        lift = (np.minimum(deficit * strength, deficit) * skin)[..., None]
        if float(lift.max()) < 1.0:
            return data

        rgb[y0:y1, x0:x1] = np.clip(face + lift, 0, 255)
        print(f"[retouch] evened skin shading (max +{lift.max():.0f})", flush=True)
        buf = io.BytesIO()
        Image.fromarray(rgb.astype(np.uint8)).save(
            buf, format="JPEG", quality=95, subsampling=0
        )
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 -- a retouch is never worth a failed page
        print(f"[retouch] skin shading skipped: {e}", flush=True)
        return data


def _remove_skin_specks(data: bytes, region: dict) -> bytes:
    """Erase the swapper's dark flecks from skin, leaving real features alone."""
    if not region or not settings.speck_removal_enabled:
        return data
    try:
        import cv2
        import numpy as np

        from .color import open_srgb

        img = open_srgb(data)
        W, H = img.size
        bounds = _region_bounds_pct(region)
        if not bounds:
            return data
        bx, by, bw, bh = bounds
        x0, y0 = int(bx / 100 * W), int(by / 100 * H)
        x1, y1 = int((bx + bw) / 100 * W), int((by + bh) / 100 * H)
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(W, x1), min(H, y1)
        if x1 - x0 < 8 or y1 - y0 < 8:
            return data

        rgb = np.array(img.convert("RGB"))  # a copy: the patch is written back
        face = rgb[y0:y1, x0:x1]
        lum = face.mean(axis=2).astype(np.float32)
        skin = float(np.median(lum))
        dark = (lum < skin * SPECK_DARK_RATIO).astype(np.uint8)
        if not dark.any():
            return data

        n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
        specks = np.zeros_like(dark)
        count = 0
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] <= SPECK_MAX_AREA:
                specks[labels == i] = 1
                count += 1
        if not count:
            return data

        # Grow slightly so the speck's own soft edge goes with it, then fill
        # from the skin around it.
        specks = cv2.dilate(specks, np.ones((3, 3), np.uint8), iterations=1)
        healed = cv2.inpaint(face, specks, 4, cv2.INPAINT_TELEA)
        rgb[y0:y1, x0:x1] = healed
        print(f"[retouch] removed {count} skin specks", flush=True)

        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=95, subsampling=0)
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 -- a retouch is never worth a failed page
        print(f"[retouch] speck removal skipped: {e}", flush=True)
        return data


# Under-eye retouch, on the finished page.
#
# A child photographed from above in a room lit from above has their eye sockets
# in shadow, and some children simply have dark circles. The swapper reproduces
# the face it is given, so those arrive on the printed page as dark lines under
# the eyes, and a parent reads them as the book having made their child look
# tired.
#
# It has to happen HERE, on the output, not on the photo. Measured: lifting the
# shadows in the source photo moved the swapped result by 2.68 against a
# seed-to-seed noise floor of 18.54 -- faceswap-comic re-lights the face to match
# the plate and ignores the photo's own exposure, so correcting the input is
# thrown away. The output is the only place the correction survives.
#
# The method is what keeps it a real face rather than a plastic one. Only the
# LOW-FREQUENCY component is touched -- the shading -- by lifting it toward the
# cheek immediately below, which is lit skin of the same person in the same
# light. Texture, lashes, the eye itself and every edge are high-frequency and
# come through untouched. And it can only ever lighten: the correction is
# clipped at zero, so a face with no shadow under the eye is returned unchanged.


def _soften_undereye(data: bytes, region: dict, strength: float) -> bytes:
    """Lift the shadow under each eye toward the cheek beneath it."""
    if strength <= 0 or not region:
        return data
    try:
        import numpy as np

        from .color import open_srgb
        from .face_detect import eyes_in_face

        img = open_srgb(data)
        # eyes_in_face wants a box. A traced page's region is a polygon with no
        # "x" in it, so this raised KeyError: 'x' and the retouch was skipped on
        # exactly the pages that have an authored outline -- the good ones. The
        # shadow it exists to lift stayed on every one of them.
        bounds = _region_bounds_pct(region)
        if not bounds:
            return data
        bx, by, bw, bh = bounds
        eyes = eyes_in_face(data, {"x": bx, "y": by, "w": bw, "h": bh})
        if not eyes:
            return data  # no eyes located means nothing to be careful around

        W, H = img.size
        rgb = np.asarray(img, dtype=np.float32)
        mask = Image.new("L", (W, H), 0)
        draw = ImageDraw.Draw(mask)
        refs = []
        for ex, ey, ew, eh in eyes:
            # The band sits directly under the eye and a little wider than it.
            bx0, bx1 = ex - int(ew * 0.12), ex + ew + int(ew * 0.12)
            by0, by1 = ey + int(eh * 0.62), ey + int(eh * 1.75)
            draw.ellipse([bx0, by0, bx1, by1], fill=255)
            # The reference is the cheek just below: the same skin, lit.
            patch = rgb[max(0, by1) : min(H, by1 + int(eh * 0.7)),
                        max(0, bx0) : min(W, bx1)]
            if patch.size:
                refs.append(np.median(patch.reshape(-1, 3), axis=0))
        if not refs:
            return data
        ref = np.mean(refs, axis=0)

        blur = max(2.0, min(eyes[0][2] * 0.35, 40.0))
        band = np.asarray(
            mask.filter(ImageFilter.GaussianBlur(blur / 2)), dtype=np.float32
        )[..., None] / 255.0
        low = np.asarray(
            img.filter(ImageFilter.GaussianBlur(blur)), dtype=np.float32
        )
        # Clipped at zero: this lightens shadow, it never darkens skin.
        deficit = np.clip(ref[None, None, :] - low, 0, None)
        out = np.clip(rgb + strength * band * deficit, 0, 255).astype(np.uint8)

        buf = io.BytesIO()
        Image.fromarray(out).save(buf, format="JPEG", quality=95, subsampling=0)
        return buf.getvalue()
    except Exception as e:  # noqa: BLE001 -- a retouch is never worth a failed page
        print(f"[retouch] under-eye softening skipped: {e}", flush=True)
        return data


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
    attempts: int = 5,
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
    # returns raw image bytes). The strength dials live in config, because they
    # are what an operator turns when a book comes back "close, but not him".
    # cfg default is ~1.6 so we stay low to avoid over-cooking the face.
    url = f"https://api.segmind.com/v1/{settings.segmind_faceswap_model}"
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}
    source_b64 = _b64_face(face_src)  # the real child's face, cropped out of the photo
    target_b64 = _b64(target_src)   # the fixed illustrated page
    last_err: Exception | None = None
    # Segmind queues requests: a single swap measured 99-267s in testing, and the
    # old 180s ceiling cut off calls that were about to succeed -- a timeout's
    # message is empty, which is why failures logged as "attempt 1/4 failed: ".
    timeout = httpx.Timeout(360.0, connect=20.0)
    # faceswap-comic is a diffusion model: it does not paste a face, it GENERATES
    # one to fill the region, which is why a toddler comes back as a generic
    # older child however the strength dials are set (measured: hair toggle,
    # source crop 12.7%->35.6%, face_strength 1.0 with style_strength 0.25 --
    # none of them moved the likeness), and why it leaves dark marks on the skin
    # that no safe rule could remove afterwards.
    #
    # faceswap-v4 transfers the real face instead: on the same photo and plate
    # it returned the actual child, and with none of the marks. It takes the
    # same two images but none of the comic model's dials -- verified against
    # the live API, which answers "Both source_image and target_image are
    # required" to anything else -- so only those are sent.
    comic = "comic" in settings.segmind_faceswap_model
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(attempts):
            if comic:
                payload = {
                    "source_image": source_b64,
                    "target_image": target_b64,
                    "face_strength": settings.segmind_face_strength,
                    "style_strength": settings.segmind_style_strength,
                    "steps": settings.segmind_steps,
                    "cfg": 2,
                    "seed": seed + attempt * 1009,  # fresh seed each redo
                    "base64": False,
                    "output_format": "jpeg",
                }
            else:
                payload = {
                    "source_image": source_b64,
                    "target_image": target_b64,
                    "base64": False,
                    "output_format": "jpeg",
                }
            try:
                r = await client.post(url, headers=headers, json=payload)
                r.raise_for_status()
                content = r.content
                # Keep the template's hair: paste only the AUTHORED face oval from
                # the full swap back onto the original template. No authored
                # region -> the full-head swap is used as it comes back, which is
                # the configuration that was personalising faces well.
                if face_region:
                    try:
                        content = _composite_face_region(
                            target_src, content, face_region
                        )
                    except Exception as ce:  # noqa: BLE001
                        print(f"[segmind] face composite skipped: {ce}", flush=True)
                # Both retouches exist to clean up after the COMIC model: the
                # specks it paints on skin, and the shadow it carries over from
                # the photo. faceswap-v4 produces neither, so running them on
                # its output is all risk and no benefit -- measured, the speck
                # remover found "91 specks" in a face that had none and ate the
                # child's eye and mouth.
                if comic:
                    content = _remove_skin_specks(content, face_region)
                    content = _even_skin_shading(
                        content, face_region, settings.skin_shading_lift
                    )
                    content = _soften_undereye(
                        content, face_region, settings.undereye_softening
                    )
                return _save_bytes(content, prefix="page")
            except Exception as e:  # noqa: BLE001 — redo the swap on any failure
                last_err = e
                reason = _segmind_reason(e)
                print(
                    f"[segmind] faceswap attempt {attempt + 1}/{attempts} failed: "
                    f"{reason}",
                    flush=True,
                )
                # Retrying cannot fix a bad key or an empty balance; say so now
                # instead of burning several minutes and then failing anyway.
                if _segmind_permanent(e):
                    raise RuntimeError(f"Segmind: {reason}") from e
                if attempt < attempts - 1:
                    await asyncio.sleep(_segmind_backoff(e, attempt))
    raise RuntimeError(
        f"Segmind faceswap failed after {attempts} attempts: "
        f"{_segmind_reason(last_err) if last_err else 'unknown error'}"
    )


def _segmind_reason(e: Exception) -> str:
    """A failure in words an admin can act on. httpx timeouts stringify to ''."""
    if isinstance(e, httpx.TimeoutException):
        return f"timed out waiting for Segmind ({type(e).__name__})"
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        # Segmind answers with pretty-printed JSON, and a log line stops at the
        # first newline -- which is how "request rejected (HTTP 400) {" reached
        # the admin with the one useful sentence on the line after it.
        body = " ".join((e.response.text or "").split())[:300]
        label = {
            401: "API key rejected",
            402: "out of credits",
            403: "API key not allowed",
            406: "out of credits",
            429: "rate limited",
        }.get(code, "server error" if code >= 500 else "request rejected")
        return f"{label} (HTTP {code}) {body}".strip()
    if isinstance(e, httpx.TransportError):
        return f"could not reach Segmind ({type(e).__name__})"
    return str(e) or type(e).__name__


# Segmind answers its own internal faults with 400 as well -- "Internal Polling
# Error" is theirs, not ours, and it comes and goes. Treating it as permanent
# failed a 28-page book twice in a row on a service hiccup, which on a real
# order is a customer watching a dead preview.
SEGMIND_TRANSIENT_400 = ("internal polling error", "internal server", "try again")


def _segmind_permanent(e: Exception) -> bool:
    # 400 usually means the request itself is wrong -- a misnamed field, a model
    # that wants different inputs. Five identical retries cannot make it right,
    # and on a 28-page book that is 140 pointless calls before anyone is told.
    # But only when the 400 is actually about the request: the body says which.
    if not isinstance(e, httpx.HTTPStatusError):
        return False
    code = e.response.status_code
    if code == 400:
        body = (e.response.text or "").lower()
        return not any(s in body for s in SEGMIND_TRANSIENT_400)
    return code in (401, 402, 403, 406)


def _segmind_backoff(e: Exception, attempt: int) -> float:
    """Seconds to wait before the next attempt.

    The old 1.5/3/4.5s waits gave a busy Segmind about nine seconds to recover
    before a whole preview was written off. Rate limits say how long to wait;
    everything else backs off from 8s to about a minute.
    """
    if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 429:
        try:
            return min(120.0, max(5.0, float(e.response.headers.get("retry-after", ""))))
        except ValueError:
            return 20.0 * (attempt + 1)
    return min(60.0, 8.0 * (2 ** attempt))


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
    region: dict, size: tuple[int, int], padding: Optional[float] = None
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
    edge = max(pw, ph) * (
        1 + (FACE_CROP_PADDING if padding is None else padding)
    )
    edge = min(edge, float(min(cw, ch)))  # never larger than the canvas
    half = edge / 2
    left = int(round(min(max(cx - half, 0), cw - edge)))
    top = int(round(min(max(cy - half, 0), ch - edge)))
    side = int(round(edge))
    return left, top, left + side, top + side


def _openai_mask_png(
    region: dict, plate_size: tuple[int, int], box: tuple[int, int, int, int]
) -> Optional[bytes]:
    """An RGBA mask for the crop: TRANSPARENT over the face, opaque elsewhere.

    /images/edits reads a mask's fully transparent pixels as "edit here" and
    leaves the rest, and with several inputs the mask applies to the FIRST image
    — so the plate crop has to lead and the photo follows as reference. Without
    this the model re-renders the whole crop and the result only lines up with
    the artwork by luck, which is exactly how a swap ends up looking wrong.

    Must match the crop's dimensions, so it is built in crop coordinates.
    """
    bounds = _region_bounds_pct(region)
    if not bounds:
        return None
    cw, ch = plate_size
    left, top, right, bottom = box
    crop_w, crop_h = right - left, bottom - top
    if crop_w <= 0 or crop_h <= 0:
        return None

    # Opaque = keep. Alpha 0 inside the face only.
    mask = Image.new("RGBA", (crop_w, crop_h), (0, 0, 0, 255))
    draw = ImageDraw.Draw(mask)

    points = region.get("points")
    if points and len(points) >= 3:
        try:
            poly = [
                (float(px) / 100 * cw - left, float(py) / 100 * ch - top)
                for px, py in points
            ]
        except (TypeError, ValueError):
            return None
        draw.polygon(poly, fill=(0, 0, 0, 0))
    else:
        x, y, w, h = bounds
        draw.ellipse(
            [
                x / 100 * cw - left,
                y / 100 * ch - top,
                (x + w) / 100 * cw - left,
                (y + h) / 100 * ch - top,
            ],
            fill=(0, 0, 0, 0),
        )

    buf = io.BytesIO()
    mask.save(buf, format="PNG")
    return buf.getvalue()


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


def _openai_masked_prompt(style_prompt: Optional[str]) -> str:
    """Instruction for the masked edit: plate first, photo second.

    gpt-image-1 treats a mask as guidance rather than a hard boundary, and the
    docs are explicit that masking is prompt-based — so the prompt has to say the
    same thing the mask does.
    """
    style = (style_prompt or "").strip()
    return (
        "The first image is a crop of a children's storybook illustration, with "
        "the character's face marked as the editable (transparent) area. The "
        "second image is a reference photo of a real child. Repaint ONLY the "
        "masked face so it is recognisably the child from the reference photo - "
        "copy their face shape, eyes, eyebrows, nose, mouth and skin tone. The "
        "illustrated character's original facial features must not survive. "
        "Everything outside the mask - hair, clothing, background, the art style, "
        "brushwork, colour palette and lighting - must stay exactly as it is in "
        "the first image. Keep the new face a painted illustration in the same "
        "style, not a photograph."
        + (f" Art style: {style}." if style else "")
    )


def _openai_prompt(style_prompt: Optional[str], photo_first: bool = True) -> str:
    """One fixed instruction for every page. Deliberately identical across pages
    (only the page's own stylePrompt varies) so the model is never nudged toward
    a different reading of the character from one page to the next.

    The wording follows the image order, because the model is told which input is
    which by position — see _openai_edit_call for why the photo goes first.
    """
    style = (style_prompt or "").strip()
    photo, plate = ("first", "second") if photo_first else ("second", "first")
    return (
        f"The {photo} image is a reference photo of a real child. The {plate} "
        "image is a crop of a children's storybook illustration. Redraw ONLY the "
        f"face in the {plate} image so it is recognisably the same child as in "
        "the reference photo - copy their face shape, eyes, eyebrows, nose, mouth "
        "and skin tone. This is a face replacement: the illustrated character's "
        "original facial features must not survive the edit. Keep the "
        "illustration's exact art style, brushwork, colour palette, lighting "
        "direction and the character's existing hair, head angle and expression. "
        "Do not render the face photorealistically; it must stay a painted "
        "illustration. Change nothing else in the image."
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
    input_fidelity: Optional[str] = None,
    photo_first: bool = True,
    mask_png: Optional[bytes] = None,
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
        "input_fidelity": input_fidelity or settings.openai_input_fidelity,
        "n": "1",
    }
    last_err: Exception | None = None
    async with httpx.AsyncClient(timeout=300) as client:
        for attempt in range(attempts):
            # ORDER MATTERS, and the mask decides it. A mask applies to the
            # FIRST image, so a masked edit must lead with the plate crop: the
            # transparent face is the only region the model may repaint, and
            # input_fidelity="high" then works FOR us by pinning the artwork
            # around it. Unmasked, there is no boundary to protect, so the photo
            # leads instead and takes the fidelity budget for the identity.
            scene_part = ("image[]", ("scene.png", scene_png, "image/png"))
            face_part = ("image[]", ("face.jpg", face_bytes, "image/jpeg"))
            files = (
                [scene_part, face_part]
                if (mask_png or not photo_first)
                else [face_part, scene_part]
            )
            if mask_png:
                files.append(("mask", ("mask.png", mask_png, "image/png")))
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
    quality: Optional[str] = None,
    input_fidelity: Optional[str] = None,
    photo_first: bool = True,
    crop_padding: Optional[float] = None,
) -> str:
    """Personalize a child's face onto an ILLUSTRATED base page via gpt-image-1.

    Face-region crop -> /images/edits -> paste back -> feathered-mask composite.
    Returns the saved /uploads URL. See the design notes at the top of this block
    for why only the crop is sent.
    """
    plate_bytes = _image_bytes(target_src)
    face_bytes = _image_bytes(face_src)
    # Explicit overrides come from the admin A/B tool; the pipeline passes none
    # and gets the configured behaviour.
    quality = (quality or _openai_quality(is_preview)).strip().lower()
    fidelity = (input_fidelity or settings.openai_input_fidelity).strip().lower()
    padding = FACE_CROP_PADDING if crop_padding is None else crop_padding

    cache_key = _openai_cache_key(
        plate_bytes,
        face_bytes,
        json.dumps(face_region or {}, sort_keys=True),
        style_prompt or "",
        settings.openai_image_model,
        settings.openai_image_size,
        fidelity,
        quality,
        padding,
        photo_first,
        "masked-v1",
    )
    cached = _openai_cache_get(cache_key)
    if cached:
        print(f"[openai] cache hit ({quality}) -> {cached}", flush=True)
        return cached

    from .color import open_srgb

    plate = open_srgb(plate_bytes)
    box = _face_crop_box(face_region, plate.size, padding) if face_region else None
    prompt = _openai_prompt(style_prompt, photo_first)

    if box:
        crop = plate.crop(box)
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        # Mark the face inside the crop as the only editable area. With one, the
        # prompt changes too: the mask is guidance for this model, not a hard
        # boundary, so both have to say the same thing.
        mask_png = _openai_mask_png(face_region or {}, plate.size, box)
        edited = await _openai_edit_call(
            scene_png=buf.getvalue(),
            face_bytes=face_bytes,
            prompt=_openai_masked_prompt(style_prompt) if mask_png else prompt,
            quality=quality,
            input_fidelity=fidelity,
            photo_first=photo_first,
            mask_png=mask_png,
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
            input_fidelity=fidelity,
            photo_first=photo_first,
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
    content = _remove_skin_specks(content, face_region)
    content = _soften_undereye(content, face_region, settings.undereye_softening)

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
}

# gpt-image-1 token prices, USD per 1M tokens.
OPENAI_IMAGE_INPUT_USD_PER_MTOK = 10.0
OPENAI_IMAGE_OUTPUT_USD_PER_MTOK = 40.0

# Output image tokens for a 1024x1024 square, per quality tier. This is the part
# people quote as "the price of an image".
OPENAI_OUTPUT_TOKENS = {"low": 272, "medium": 1056, "high": 4160}

# ...but an EDIT also pays for what it reads. Each square input image costs a 65
# base + 129 per 512px tile (4 tiles at 1024px), and input_fidelity="high" adds a
# flat ~4160 tokens per square image on top. At $10/1M that surcharge alone is
# ~$0.042 an image — four times the entire low-tier output cost, which is why a
# quote of "$0.011 per image" is only true at low fidelity.
OPENAI_INPUT_TOKENS_PER_IMAGE = 65 + 129 * 4
OPENAI_HIGH_FIDELITY_TOKENS_SQUARE = 4160


def openai_est_cost(
    quality: Optional[str] = None,
    input_fidelity: Optional[str] = None,
    n_input_images: int = 2,
) -> float:
    """Indicative cost of ONE gpt-image-1 edit, input tokens included.

    A face swap sends two images (the child's photo and the plate crop) and gets
    one back, so the input side is not a rounding error — at high fidelity it is
    the majority of the bill.
    """
    q = (quality or settings.openai_image_quality or "medium").strip().lower()
    fid = (input_fidelity or settings.openai_input_fidelity or "low").strip().lower()

    out_tokens = OPENAI_OUTPUT_TOKENS.get(q, OPENAI_OUTPUT_TOKENS["medium"])
    in_tokens = OPENAI_INPUT_TOKENS_PER_IMAGE * max(n_input_images, 1)
    if fid == "high":
        in_tokens += OPENAI_HIGH_FIDELITY_TOKENS_SQUARE * max(n_input_images, 1)

    return round(
        out_tokens * OPENAI_IMAGE_OUTPUT_USD_PER_MTOK / 1_000_000
        + in_tokens * OPENAI_IMAGE_INPUT_USD_PER_MTOK / 1_000_000,
        4,
    )


def provider_est_cost(
    provider: str,
    quality: Optional[str] = None,
    input_fidelity: Optional[str] = None,
) -> Optional[float]:
    if provider == "openai":
        return openai_est_cost(quality, input_fidelity)
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
    tuning: Optional[dict] = None,
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
        t = tuning or {}
        return await _openai_faceswap(
            target_src=target_src,
            face_src=face_src,
            style_prompt=style_prompt,
            face_region=face_region,
            is_preview=is_preview,
            quality=t.get("quality"),
            input_fidelity=t.get("fidelity"),
            photo_first=t.get("photo_first", True),
            crop_padding=t.get("crop_padding"),
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


def _replicate_raise(r: httpx.Response, what: str) -> None:
    """Raise with Replicate's own explanation, not just the status code.

    A bare "422 Unprocessable Entity" in the admin list says nothing about which
    input was rejected, so the detail Replicate sends is the whole diagnosis.
    """
    if r.status_code < 400:
        return
    detail = ""
    try:
        body = r.json()
        detail = body.get("detail") or body.get("title") or ""
        if isinstance(body.get("invalid_fields"), list):
            fields = ", ".join(
                f"{f.get('field')}: {f.get('description')}"
                for f in body["invalid_fields"]
            )
            detail = f"{detail} ({fields})" if detail else fields
    except Exception:  # noqa: BLE001
        detail = (r.text or "")[:300]
    raise RuntimeError(
        f"Replicate {r.status_code} on {what}: {detail or 'no detail given'}"
    )


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
            _replicate_raise(r, f"{model} (model endpoint)")
            return r.json()
        # Community model — resolve its latest version and use /v1/predictions.
        m = await client.get(
            f"https://api.replicate.com/v1/models/{model}", headers=headers
        )
        _replicate_raise(m, f"resolving version of {model}")
        version = m.json()["latest_version"]["id"]
    else:
        version = model.split(":", 1)[1]
    r = await _replicate_post(
        client,
        "https://api.replicate.com/v1/predictions",
        wait,
        {"version": version, "input": inp},
    )
    _replicate_raise(r, f"{model} (versioned endpoint)")
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
        # An authored page that cannot reach the swapper must not quietly become a
        # txt2img invention: that ignores the illustration the book was drawn with
        # and hands the customer an off-model page. Same contract the segmind
        # branch below states for its own failures -- say why, and stop.
        if not can_faceswap and _is_raster(base_image_url or ""):
            why = (
                "no usable child photo for this render"
                if not face_image_name
                else f"replicate_mode is {settings.replicate_mode!r}, not 'faceswap'"
            )
            raise RuntimeError(
                f"This page has base art but could not be personalized: {why}."
            )
        if can_faceswap:
            # Which service personalizes the face is an ADMIN RUNTIME toggle
            # (Settings -> Image provider), not an env var, so the two can be
            # A/B'd on the same deploy. Falls back to the env-configured
            # faceswap_provider only for the non-segmind/openai options.
            from .app_settings import image_provider

            active = image_provider()
            # Which swapper ran, and whether anything constrained it. Both
            # decide what comes back, neither was recoverable from the finished
            # image, and the provider is a runtime toggle rather than a deploy
            # -- so "we deployed the fix" and "the fix was in the path that
            # ran" were impossible to tell apart. region=NONE is the loud case:
            # no authored region means the full-head swap is used exactly as it
            # returns, composite and hair guard included in what is skipped.
            _pts = (face_region or {}).get("points") if face_region else None
            print(
                f"[render] provider={active} "
                f"region={'traced' if _pts else ('box' if face_region else 'NONE')}",
                flush=True,
            )
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
