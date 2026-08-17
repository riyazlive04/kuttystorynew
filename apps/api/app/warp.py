"""Photoshop-style text warp (Arc), applied to a rendered text layer.

The Page Editor mirrors Photoshop's Warp Options dialog: a style, a horizontal
or vertical orientation, a Bend, and Horizontal/Vertical Distortion. This module
turns those four numbers into a mesh transform over the RGBA layer the text was
drawn into, so warping composes with everything else the text layer does —
fonts, letter spacing, outline, drop shadow — instead of re-implementing it.

Photoshop's exact curves are not published; these are the standard
approximations, and they behave the way the sliders lead you to expect:

  Bend        arches the block along its axis (parabolic; +ve bulges away
              from the baseline, -ve bulges toward it)
  Distortion  applies perspective along an axis, so one end of the block is
              wider/taller than the other
"""
from __future__ import annotations

from PIL import Image

STYLE_NONE = "none"
STYLE_ARC = "arc"
STYLES = (STYLE_NONE, STYLE_ARC)

def _unwarp_t(td: float, d: float) -> float:
    """Invert the distortion map f(t) = t + d*(t^2 - t).

    f keeps the two ends pinned (f(0)=0, f(1)=1) and squeezes one half while
    stretching the other — the perspective look the Distortion sliders give.
    Solving it per output line is what keeps the result gap-free.
    """
    if not d:
        return td
    a, b_, c = d, 1.0 - d, -td
    disc = b_ * b_ - 4 * a * c
    if disc < 0:
        return td
    root = disc ** 0.5
    for t in ((-b_ + root) / (2 * a), (-b_ - root) / (2 * a)):
        if -0.001 <= t <= 1.001:
            return min(1.0, max(0.0, t))
    return td


def warp_layer(
    layer: Image.Image,
    *,
    style: str = STYLE_ARC,
    bend: float = 0.0,
    distort_h: float = 0.0,
    distort_v: float = 0.0,
    vertical: bool = False,
) -> Image.Image:
    """Warp an RGBA text layer in place of its bounding box.

    bend / distort_h / distort_v are percentages in [-100, 100], matching the
    dialog. Returns the layer untouched when there is nothing to do, so the
    common unwarped case costs nothing.
    """
    if style != STYLE_ARC or (not bend and not distort_h and not distort_v):
        return layer

    box = layer.getbbox()
    if not box:
        return layer

    # Work on the text's own bounding box so the warp is relative to the block,
    # not to the whole page — a 5% bend should not depend on canvas size.
    x0, y0, x1, y1 = box
    block = layer.crop(box)
    bw, bh = block.size
    if bw < 2 or bh < 2:
        return layer

    b = max(-100.0, min(100.0, bend)) / 100.0
    dh = max(-100.0, min(100.0, distort_h)) / 100.0
    dv = max(-100.0, min(100.0, distort_v)) / 100.0

    # A full bend lifts the block by roughly half its own height.
    span = bh if not vertical else bw
    amp = b * span * 1.6

    # Grow the canvas so the arc has room to move into.
    pad_y = int(abs(amp) + abs(dv) * bh) + 4
    pad_x = 4
    cw, ch = bw + 2 * pad_x, bh + 2 * pad_y
    warped = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    # Work backwards, one destination pixel line at a time: for each output line
    # ask which input line lands on it. Pushing input lines FORWARD instead
    # leaves gaps wherever the distortion spreads them apart, which shreds the
    # glyphs into stripes; an inverse map always fills every output line.
    n = bw if not vertical else bh
    for j in range(n):
        td = (j + 0.5) / n
        ts = _unwarp_t(td, dh if not vertical else dv)
        if ts < 0.0 or ts > 1.0:
            continue
        u = 2 * ts - 1                  # -1 .. 1 across the block
        arc = -amp * (1.0 - u * u)      # parabolic arch, flat at the ends

        if not vertical:
            i = min(bw - 1, max(0, int(ts * bw)))
            line = block.crop((i, 0, i + 1, bh))
            k = 1.0 + dv * u                       # vertical taper
            h = max(1, int(round(bh * k)))
            if h != bh:
                line = line.resize((1, h), Image.BILINEAR)
            x, y = pad_x + j, pad_y + arc + (bh - h) / 2
        else:
            i = min(bh - 1, max(0, int(ts * bh)))
            line = block.crop((0, i, bw, i + 1))
            k = 1.0 + dh * u
            w = max(1, int(round(bw * k)))
            if w != bw:
                line = line.resize((w, 1), Image.BILINEAR)
            x, y = pad_x + arc + (bw - w) / 2, pad_y + j

        warped.alpha_composite(line, (int(round(x)), int(round(y))))

    # Paste back so the block stays centred where the text was placed.
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(warped, (x0 - pad_x, y0 - pad_y))
    return out
