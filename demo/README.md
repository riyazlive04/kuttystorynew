# Public walkthrough recorder

Records a video of a first-time visitor finding kuttystory.co.in and ordering a
book — open the browser, type the address, browse the library, personalize a
story with a real photo, watch the AI preview render, and check out.

```bash
node demo/record-demo.mjs
```

Two files land in `demo/output/`:

| File | What it is |
| --- | --- |
| `kuttystory-demo-<stamp>.mp4` | Real time, nothing cut |
| `kuttystory-demo-<stamp>-fastcut.mp4` | Same video, only the AI render wait sped up 10× |

---

## The two things that are not what they look like

**The password screen is skipped, not edited out.** While the "under
construction" gate is up, the recorder calls `POST /site-access/unlock` over the
API *before it opens a page*, so the browser arrives already holding the gate
cookie and goes straight to the real homepage. The gate is never rendered, so
there is nothing to cut. The password lives in `demo/.env` (gitignored) — delete
that line once the gate comes down and the site is genuinely public.

**The address bar is drawn, not captured.** The run is headless, and headless
Chromium has no window furniture — the address bar of steps 1–2 does not exist
to be filmed. [`lib/chrome-frame.html`](lib/chrome-frame.html) draws it instead:
it is screenshotted once per typed character to build the opening sequence, then
composited above the recording for the rest of the video. **Everything below
that 90px strip is a genuine recording of the real production site.**

The drawn bar tracks the real journey. `page.url()` is polled throughout the run
(Next's app router navigates client-side, so `framenavigated` would miss most of
it), a strip is rendered per address reached, and each is composited only over
the span it was current — so the bar reads `/stories`, then
`/stories/beach-story`, then `/preview/…`, then `/checkout`, with the real page
title in the tab.

Headless also means the run never touches your desktop — no window steals focus,
no keystrokes go astray. It does mean there is no OS cursor to record, so the
recorder injects an on-screen pointer that follows the real mouse events
Playwright dispatches.

---

## It stops at the payment sheet, on purpose

Production runs a **live** Razorpay key (`rzp_live_…`). Completing a payment here
would be a real charge against a real card and would push a real order into the
print queue. So the recorder fills in checkout, clicks **Pay**, lets the genuine
Razorpay sheet open and sit on screen showing UPI / cards / netbanking, then
dismisses it with Escape without touching anything inside.

Two real side effects remain, and they are unavoidable if the video is to show
the real product:

- **A preview job is generated for real**, consuming Segmind / Replicate credits.
- **Clicking Pay creates a real pending order row**, because the site stores the
  order before it charges (so the server, not the browser, sets the price). It is
  unpaid and harmless, but it will appear in the admin order list. The default
  buyer details are deliberately obvious — `KuttyStory Demo`,
  `demo@kuttystory.co.in`, phone `9000000000` — so it is easy to spot and delete.

---

## Rehearsing without those side effects

`DEMO_STOP_AFTER` ends the run cleanly after a given step and still writes a
video of everything up to that point:

```bash
DEMO_STOP_AFTER=4  node demo/record-demo.mjs   # ~1 min: browser, address bar, library, story page
DEMO_STOP_AFTER=6  node demo/record-demo.mjs   # + the photo upload, no preview generated
DEMO_STOP_AFTER=11 node demo/record-demo.mjs   # + checkout filled in, Pay never clicked
```

Step 4 is the one to use when you have changed the homepage or the library and
just want to see it back quickly.

---

## Settings

Everything is an environment variable, or a line in `demo/.env`.

| Variable | Default | Notes |
| --- | --- | --- |
| `SITE_GATE_PASSWORD` | *(from `demo/.env`)* | Unset once the site is public |
| `DEMO_SITE` / `DEMO_HOST` | `https://kuttystory.co.in` / `kuttystory.co.in` | Point at staging to rehearse |
| `DEMO_STORY` | `Beach Story` | Must match a title in the library |
| `DEMO_CHILD` / `DEMO_AGE` / `DEMO_GENDER` | `Yahya` / `5` / `Boy` | |
| `DEMO_PHOTO` | `Yahya.jpg` in the repo root | **See below** |
| `DEMO_NAME`, `DEMO_EMAIL`, `DEMO_PHONE`, `DEMO_ADDR1`, `DEMO_ADDR2`, `DEMO_CITY`, `DEMO_STATE`, `DEMO_PIN` | demo values | What lands on the pending order |
| `DEMO_SPEEDUP` | `10` | How hard the fast cut compresses the render wait |
| `DEMO_RENDER_TIMEOUT_MS` | `1200000` (20 min) | Give up if the render stalls |
| `DEMO_STOP_AFTER` | *(off)* | See above |
| `DEMO_OUT` | `demo/output` | |
| `FFMPEG` | `ffmpeg` | Needs a full build — `gdigrab` is not used, but `setpts` is |

### The photo is a real child's face

The default uploads `Yahya.jpg` from the repo root, and that face ends up in a
video meant to be published. If that is not a photo you hold publishing rights
to, set `DEMO_PHOTO` to one you do:

```bash
DEMO_PHOTO=/path/to/consented-photo.jpg node demo/record-demo.mjs
```

---

## Requirements

- Node 20+, and `npm install` at the repo root (Playwright is a devDependency)
- `npx playwright install chromium` if the browser is not cached yet
- **ffmpeg and ffprobe on `PATH`** — a full build, not Playwright's bundled one,
  which is compiled with `--disable-everything` and cannot run the filters here

## Files

| File | Role |
| --- | --- |
| [`record-demo.mjs`](record-demo.mjs) | The whole run: drives the site, records, composes both cuts |
| [`lib/chrome-frame.html`](lib/chrome-frame.html) | The drawn browser chrome — tab, toolbar, address bar |
| `.env` | Local only, gitignored. The gate password |
| `output/` | Gitignored. Videos, plus a `.work-*` scratch dir per run |
