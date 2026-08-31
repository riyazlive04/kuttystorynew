#!/usr/bin/env python
"""Render the book pages' face-swap demo, and regenerate its TypeScript manifest.

For every live title (and both illustrated variants of a both-gender book) this
runs the PRODUCTION swapper -- Segmind faceswap-comic, at the strengths in
apps/api config -- over the live cover art with three sample children of the
matching gender. The result is what the storefront animates, so the marketing
animation is output from the machine that makes the book.

    python tools/render_face_demos.py            # every title
    python tools/render_face_demos.py space-explorer speed-racer

Needs SEGMIND_API_KEY in apps/api/.env. Writes:

    apps/web/public/samples/faceswap/<slug>-<gender>-{base,a,b,c}.jpg
    tools/face-demos.json      (the data, including the hand-set face boxes)
    apps/web/src/lib/faceDemo.ts   (generated; do not hand-edit)

FACE BOXES are the one thing this cannot do for you. The arrow and the
highlight ring need to know where the face is, and measuring it from the swap's
own difference does not survive covers where the model regenerates background
as well -- on the unicorn plate that put the ring on the unicorn. A new title
gets a rough automatic box; check it, correct it in tools/face-demos.json, and
re-run with --emit-only. Existing boxes are never overwritten.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "apps/web/public/samples/faceswap"
DATA = ROOT / "tools/face-demos.json"
TS_OUT = ROOT / "apps/web/src/lib/faceDemo.ts"
CATALOGUE = "https://kuttystory.co.in/api/stories"

# Cards show these at 384px and the hero at 600px, so 900 covers a 2x card and
# is honest for the hero. These are marketing art, not the print plates (2482px):
# a page can show half a dozen at once, so weight matters more than headroom.
WEB_EDGE = 900
JPEG_Q = 80

# The sample children. Their headshots are committed beside the swaps, because
# the demo shows the photo a face came FROM -- they are part of the artwork, not
# just an input to it.
FACES = {
    "boy": [("a", "Aarav"), ("b", "Vihaan"), ("c", "Kabir")],
    "girl": [("a", "Anaya"), ("b", "Diya"), ("c", "Meera")],
}


def segmind_key() -> str:
    env = (ROOT / "apps/api/.env").read_text(encoding="utf-8")
    m = re.search(r"^SEGMIND_API_KEY=(.+)$", env, re.M)
    if not m or not m.group(1).strip():
        sys.exit("SEGMIND_API_KEY is not set in apps/api/.env")
    return m.group(1).strip()


def load(src, edge: int | None = None) -> Image.Image:
    if str(src).startswith("http"):
        with urllib.request.urlopen(str(src), timeout=120) as r:
            img = Image.open(io.BytesIO(r.read()))
    else:
        img = Image.open(src)
    img = img.convert("RGB")
    if edge and max(img.size) > edge:
        img.thumbnail((edge, edge), Image.LANCZOS)
    return img


def b64(img: Image.Image, quality: int = 94) -> str:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def swap(key: str, face: Image.Image, target_b64: str, tries: int = 3) -> bytes | None:
    """One face onto one cover. Retried with a fresh seed: blending is
    seed-sensitive, so a genuine retry can succeed where a repeat would not."""
    payload = {
        "source_image": b64(face),
        "target_image": target_b64,
        "face_strength": 0.85,   # settings.segmind_face_strength
        "style_strength": 0.7,   # settings.segmind_style_strength
        "steps": 12,
        "cfg": 2,
        "seed": 1234,
        "base64": False,
        "output_format": "jpeg",
    }
    for attempt in range(tries):
        req = urllib.request.Request(
            "https://api.segmind.com/v1/faceswap-comic",
            data=json.dumps(payload).encode(),
            headers={"x-api-key": key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 -- any failure is worth a redo
            detail = ""
            if isinstance(e, urllib.error.HTTPError):
                detail = (e.read() or b"")[:160].decode("utf8", "ignore")
            print(f"    attempt {attempt + 1}/{tries} failed: {e} {detail}", flush=True)
            payload["seed"] += 1009
            time.sleep(3 * (attempt + 1))
    return None


def rough_face_box(base: Image.Image, swapped: Image.Image) -> dict:
    """A STARTING POINT for a new title's face box -- always eyeball it."""
    diff = ImageChops.difference(base, swapped).convert("L")
    diff = diff.filter(ImageFilter.GaussianBlur(4))
    bbox = diff.point(lambda v: 255 if v > 28 else 0).getbbox()
    if not bbox:
        return {"x": 50, "y": 50, "w": 20, "h": 22}
    W, H = base.size
    x0, y0, x1, y1 = bbox
    return {
        "x": round(100 * (x0 + x1) / 2 / W, 1),
        "y": round(100 * (y0 + y1) / 2 / H, 1),
        "w": round(min(40, 100 * (x1 - x0) / W), 1),
        "h": round(min(40, 100 * (y1 - y0) / H), 1),
    }


def variants_of(story: dict) -> list[tuple[str, str]]:
    """Which illustrated variants a title has, and the cover art for each."""
    lock = story.get("genderLock")
    if lock in ("boy", "girl"):
        return [(lock, story["coverImage"])]
    out = [("boy", story["coverImage"])]
    if story.get("coverImageGirl"):
        out.append(("girl", story["coverImageGirl"]))
    return out


def render(only: list[str]) -> None:
    key = segmind_key()
    data = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {}
    with urllib.request.urlopen(CATALOGUE, timeout=60) as r:
        stories = json.load(r)

    for story in stories:
        slug = story["slug"]
        if only and slug not in only:
            continue
        for gender, cover_url in variants_of(story):
            print(f"[{slug}/{gender}] {cover_url}", flush=True)
            try:
                base = load(cover_url, WEB_EDGE)
            except Exception as e:  # noqa: BLE001
                print(f"  cover download failed: {e}", flush=True)
                continue
            base.save(ASSETS / f"{slug}-{gender}-base.jpg", "JPEG", quality=JPEG_Q,
                      optimize=True, progressive=True)
            target_b64 = b64(base)

            frames, first_swap = [], None
            for fkey, child in FACES[gender]:
                face_path = ASSETS / "faces" / f"{gender}-{fkey}.jpg"
                if not face_path.exists():
                    print(f"  {fkey}: no headshot at {face_path}", flush=True)
                    continue
                raw = swap(key, load(face_path), target_b64)
                if raw is None:
                    print(f"  {fkey}: gave up", flush=True)
                    continue
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                if img.size != base.size:
                    img = img.resize(base.size, Image.LANCZOS)
                img.save(ASSETS / f"{slug}-{gender}-{fkey}.jpg", "JPEG", quality=JPEG_Q,
                         optimize=True, progressive=True)
                first_swap = first_swap or img
                frames.append({"key": fkey, "child": child})
                print(f"  {fkey}: ok ({child})", flush=True)

            if not frames:
                print(f"  !! nothing usable for {slug}/{gender}", flush=True)
                continue
            entry = data.setdefault(slug, {}).setdefault(gender, {})
            entry["frames"] = frames
            if "face" not in entry:
                entry["face"] = rough_face_box(base, first_swap)
                print(f"  NEW face box (rough, check it): {entry['face']}", flush=True)

    DATA.write_text(json.dumps(data, indent=2), encoding="utf-8")


HEADER = '''/**
 * Pre-rendered face-swap demos, one per book and per illustrated variant.
 *
 * Each frame pairs a real child's PHOTO with the cover art that photo produced
 * -- swapped by the production pipeline (Segmind faceswap-comic, at the
 * strengths in the API config) against the LIVE cover art, not a mock-up.
 * Showing the source photo beside the result is the point: a parent sees where
 * the face came from, which no amount of copy explains as well.
 *
 * GENERATED by tools/render_face_demos.py -- do not hand-edit; edit
 * tools/face-demos.json and re-run it with --emit-only. A book whose swaps
 * failed is absent here and falls back to its static cover, so this file is
 * also the record of which titles the demo actually covers.
 */
export type Gender = "boy" | "girl";

export type FaceDemoFrame = {
  /** The cover with this child's face swapped in. */
  src: string;
  /** The headshot that face came from, shown in the corner. */
  photo: string;
  /** The example child, named in the caption. */
  child: string;
};

export type FaceDemo = {
  /** The untouched illustration -- the "before" the loop returns to. */
  base: string;
  frames: FaceDemoFrame[];
  /** Where the face sits in the art, in % of the frame. Hand-checked: measuring
   *  it from the swap's own difference fails on covers where the model
   *  regenerates the background too. */
  face: { x: number; y: number; w: number; h: number };
};

const DEMOS: Record<string, Partial<Record<Gender, FaceDemo>>> = {
'''

FOOTER = '''};

/**
 * The demo for a book, or undefined where none was rendered.
 *
 * A both-gender book is illustrated twice and has a demo per variant; asking
 * for the variant that does not exist returns nothing rather than the other
 * one, because answering a visitor's Girl with a boy's cover is worse than
 * showing them the plain art.
 */
export function faceDemoFor(
  slug: string,
  gender: Gender = "boy",
): FaceDemo | undefined {
  return DEMOS[slug]?.[gender];
}
'''


def emit() -> None:
    """Write faceDemo.ts from what is ON DISK: a variant whose files are missing
    simply does not appear, and that title falls back to its static cover."""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    blocks = []
    for slug in sorted(data):
        body = []
        for gender in ("boy", "girl"):
            v = data[slug].get(gender)
            if not v or not (ASSETS / f"{slug}-{gender}-base.jpg").exists():
                continue
            rows = []
            for f in v["frames"]:
                src = f"{slug}-{gender}-{f['key']}.jpg"
                if not (ASSETS / src).exists():
                    continue
                rows.append(
                    "        {\n"
                    f'          src: "/samples/faceswap/{src}",\n'
                    f'          photo: "/samples/faceswap/faces/{gender}-{f["key"]}.jpg",\n'
                    f'          child: "{f["child"]}",\n'
                    "        },"
                )
            if not rows:
                continue
            fb = v["face"]
            body.append(
                f"    {gender}: {{\n"
                f'      base: "/samples/faceswap/{slug}-{gender}-base.jpg",\n'
                "      frames: [\n" + "\n".join(rows) + "\n      ],\n"
                f'      face: {{ x: {fb["x"]}, y: {fb["y"]}, w: {fb["w"]}, h: {fb["h"]} }},\n'
                "    },"
            )
        if body:
            blocks.append(f'  "{slug}": {{\n' + "\n".join(body) + "\n  },")

    TS_OUT.write_text(HEADER + "\n".join(blocks) + "\n" + FOOTER, encoding="utf-8")
    print(f"wrote {TS_OUT.relative_to(ROOT)} with {len(blocks)} titles")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("slugs", nargs="*", help="only these titles (default: all)")
    ap.add_argument("--emit-only", action="store_true",
                    help="regenerate faceDemo.ts from tools/face-demos.json without rendering")
    args = ap.parse_args()
    ASSETS.mkdir(parents=True, exist_ok=True)
    if not args.emit_only:
        render(args.slugs)
    emit()
