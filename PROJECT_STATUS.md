# KuttyStory — Project Status & Handoff

A personalized AI children's storybook platform (Diffrun-style): a child's name +
photo → identity-consistent illustrations with text, a free flip-book preview,
a paywall, Razorpay checkout, print fulfillment, and admin CMS.

Last updated mid-GPU-integration (ComfyUI on JarvisLabs).

---

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, Zustand |
| Backend | FastAPI, Pydantic v2 |
| DB | PostgreSQL + Prisma (Python client) |
| Async | Celery + Redis (+ Celery beat for purge cron) |
| GPU render | ComfyUI (FLUX.1-schnell fp8 + PuLID-Flux + Impact-Pack FaceDetailer) |
| Payments | Razorpay |
| Infra | Docker Compose (db, redis, api, worker, web) + Nginx (prod profile) |

Everything runs via `docker compose up -d`. Frontend :3000, API :8000
(Swagger /docs), admin at /admin (token `kutty-admin-dev`). DB host port 5434,
Redis 6381 (remapped to avoid conflicts).

---

## DONE (built + verified working on the running stack)

### Storefront (apps/web)
- Home, story catalogue w/ filters, story detail + personalization wizard
  (name/gender/age/photo/skin-tone), **flip-book preview** (`FlipBook.tsx`) with a
  hard, non-bypassable **paywall at page 14** (`Paywall.tsx`), cart, checkout, order
  confirmation, how-it-works, 404.
- Vibrant violet→magenta gradient theme; real logo (`public/logo.png`).
- Sticky **STORY20** promo bar (20% off 2+ books) — validated client + server.
- Conversion UX: TrustBar, WhatsApp FAB. (Tamil script removed per request.)
- Route groups: `(storefront)` vs `admin` (clean separation).
- Photo upload → `uploadPhoto()` → backend `/upload`.

### Admin dashboard (apps/web/src/app/admin)
- Token-gated. Dashboard (revenue/orders/previews/stories stats), Orders
  (fulfillment status workflow), Stories (publish/hide), **Page Editor**
  (`/admin/pages`): per-page base-art upload, scenePrompt, storyText `{{name}}`,
  X/Y%/fontSize/fontColor, face-region box — with live placement preview.

### Backend (apps/api)
- Routers: stories, jobs, orders, payments, admin, uploads.
- Prisma models: Story (BookTemplate), **PageTemplate**, Job (UserPreviewSession:
  identityVectors, photoUrl, expiresAt, isPurchased, purged, pdfDownloadUrl), Order,
  OrderItem. Auto-seed of 6 demo stories on boot.
- **Money is server-authoritative** — discount/total recomputed server-side
  (verified: tampered client amounts rejected).
- Razorpay: create-order, verify (signature), **webhook** (payment.captured →
  fires render of pages 14–28).
- **48h purge** Celery-beat cron (deletes raw photos + preview assets for expired
  non-purchased sessions).
- `/upload` (multipart) → shared storage volume, served at `/uploads/...`.

### AI pipeline (apps/api/app)
- `generation_engine.py` — the core. Providers: `mock | runpod | comfyui | replicate`
  (env `GPU_PROVIDER`).
  - **Inpaint-over-template** (Diffrun approach): loads the pre-drawn illustrated
    page (`PageTemplate.baseImageUrl`), applies PuLID identity to FLUX-schnell,
    regenerates ONLY the face via **FaceDetailer** (auto-detect) or an authored
    face region — scene/style/character stay consistent page to page.
  - **Extract-embedding-once** optimization (`identityVectors` cached, reused per
    page) — the cost lever (target < ₹0.30/frame).
  - Frozen profile: FLUX-schnell fp8, 4 steps, euler/sgm_uniform, cfg 1.0,
    1024×768, PuLID id_weight 0.85. Uses all-in-one `CheckpointLoaderSimple`.
  - **ComfyUI image bridge**: worker uploads base-art + face into ComfyUI's
    `/upload/image` and rewrites `LoadImageFromUrl`→`LoadImage`, so images never
    need public URLs / S3 for the ComfyUI path.
- `text_layer.py` — Pillow burns the personalized story line at the authored
  position (drop-shadow + outline), reads `/uploads` locally (shared volume).
- `pdf_service.py` — stitches all 28 pages into a **300 dpi CMYK print PDF**.
- `tasks.py` — Celery: extract identity once → render preview 1–13 → (on purchase)
  render 14–28 → build PDF. Progress written to DB for long-poll.

### Verified end-to-end (mock provider)
Preview (13 free / 15 locked), identity cached once, purchase → 14–28 render →
CMYK PDF served, admin PageTemplate CRUD, base-art inpaint path composites a real
JPEG with burned text.

---

## GPU DECISION: Replicate now (reliability), self-hosted later (cost)

**Chosen path: `GPU_PROVIDER=replicate`** using the hosted `zsxkib/flux-pulid`
model. The child's face is sent inline as a **data-URI** (read from the shared
storage volume) so **no S3/public storage is needed**. This is the reliable,
managed path — txt2img with identity (face rendered into a scene from the
prompt). Wired in `generation_engine.py` (`_replicate_run`, `render_page`
replicate branch). Requires `REPLICATE_API_TOKEN` + Replicate billing enabled.

### Why not self-hosted ComfyUI (yet)
We fully set up ComfyUI on a JarvisLabs A30 (FLUX-schnell fp8, PuLID model, all
nodes: PuLID-Flux [lldacing fork] + Impact-Pack + Impact-Subpack + antelopev2 +
segment_anything/facexlib/facenet-pytorch). Cleared ~8 blockers. Final wall: the
instance's **bleeding-edge ComfyUI + torch 2.11 can't _sample_ a PuLID-patched
FLUX model** (`KeyError: 'transformer_options'` in KSampler, even with
`FixPulidFluxPatch`). It's a node-vs-ComfyUI-version internals mismatch, not a
missing dep. **Parked**, not deleted — the `comfyui` provider branch + all learned
setup remain in code for the self-hosted cost path.

### Deferred: hit the ₹0.30/frame goal (post-launch)
Build a **RunPod Serverless worker** with a Docker image that **pins** the exact
ComfyUI + PuLID-Flux + torch versions we now know work together (the JarvisLabs
setup steps become a tested Dockerfile). Self-hosted + scale-to-zero = the cost
target, without bleeding-edge breakage. The `runpod` provider branch is wired.

### ⚠️ JarvisLabs gotchas (if revisited)
- ComfyUI proxied at `https://<id>.notebooksn.jarvislabs.net/proxy/8188` (path prefix!).
- **Pause/Resume wipes pip installs** (only `/home` persists) AND can change the
  proxy URL. Restart ComfyUI via process (`pkill -f main.py` + `nohup python
  main.py --listen 0.0.0.0 --port 8188 &`), not Pause/Resume.

---

## PRODUCTION BUILD — Diffrun-exact architecture (deep-researched) ✅

Reverse-engineered Diffrun via a fanned-out deep-research pass (100+ agents,
adversarially verified). Key confirmed findings:
- Diffrun's "vector embeddings + recreate per page" is **not** proof of per-page
  txt2img — it's equally consistent with **face personalization onto FIXED
  pre-drawn illustration templates**, which is how page-to-page character/style
  consistency is actually held (txt2img is stateless — "no memory between
  generations", confirmed by academic sources).
- Diffrun's flow includes **"fine-tune any face generations"** (refine) and
  **"review… and approve"** (approve-for-print) — both now built.
- **Segmind FaceSwap-Comic** is purpose-built to blend real faces into
  cartoon/illustrated art (generic Replicate swappers can't detect drawn faces).

**Architecture now implemented (`REPLICATE_MODE=faceswap`):** fixed base
illustration per page (consistent generic child) + personalize the customer's
child onto it via **Segmind FaceSwap-Comic** (`FACESWAP_PROVIDER=segmind`,
needs `SEGMIND_API_KEY`), with **automatic fallback to flux-pulid txt2img** for
pages lacking base art or when no illustrated swapper is configured (works today
with no new key). Story text = LLM-authored once per book (`{{name}}`).

**Production gaps built this pass (all deployed + smoke-tested; payment flow
excluded per request):**
- **Refine a page's face** — `POST /jobs/{id}/pages/{n}/regenerate` (fresh seed) +
  a "Regenerate" button on every page in the flip-book.
- **Approve-for-print gate** — `POST /jobs/{id}/approve`; storefront approval card
  after purchase; admin cannot move an order to production/shipped/delivered until
  the book is approved (`409` otherwise).
- **Multi-photo intake** — wizard accepts 1–3 photos; `Job.photoUrls[]`; primary
  photo drives identity, rest reserved for stronger likeness.
- **Fixed base-art per book** — `POST /admin/stories/{slug}/generate-base-art`
  (background, per-page) + "Base art (all pages)" admin button.
- **30-day preserved retention** — purchased/approved books kept `preservedUntil`
  (30d); non-purchased previews still purged 48h after expiry.
- **Config-driven page counts** everywhere (`/config`), hardcoded strings removed.

**Still needs a key / live run:** `SEGMIND_API_KEY` to exercise the exact-Diffrun
faceswap-onto-illustration path; and the Replicate account was rate-limited (429)
from heavy same-day testing, so a full multi-page live render should be re-run once
the throttle clears. All code paths deploy clean and endpoints are smoke-tested.

## RENDER APPROACH (earlier) — reverse-engineered from Diffrun — ✅ VERIFIED

Diffrun's own copy states it uses "advanced AI to create **vector embeddings of
their face and recreate it on each story page** with realistic context" + a free
preview of the **first 13 pages**. That is **identity-embedding GENERATION**
(PuLID/PhotoMaker-style), NOT photo face-swap — the child's *likeness* is recreated
in the illustration's own style, not pasted in. So:

- **Primary path = `REPLICATE_MODE=txt2img`** → `zsxkib/flux-pulid` identity
  generation. Each page's `scenePrompt` drives the scene; `stylePrompt` keeps the
  look consistent; the child's face (data-URI) conditions the identity. **Verified
  end-to-end through the real app flow** (storefront job → Celery worker →
  flux-pulid → PIL text burn → composed `/uploads/<job>_pN.jpg` → flip-book): a
  child's uploaded photo produced 3 distinct storybook pages with a recognisable
  likeness + personalised story text burned in. Free-page count aligned to 13.
- **Face-swap mode is wired but OFF by default.** A live A/B proved the two hosted
  swap models are unsuitable *for illustrated pages right now*:
  `fofr/face-swap-with-ideogram` never boots (Replicate allocates no GPU — hangs in
  `starting`); `cdingram/face-swap` runs but its insightface detector returns null
  on cartoon/illustrated faces (trained on real faces). Face-swap (`REPLICATE_MODE=
  faceswap`) is kept for the self-hosted ComfyUI inpaint path / a future working
  hosted swap model, and only triggers when a page has a real raster `baseImageUrl`
  (SVG placeholders are guarded out via `_is_raster`).

### Replicate client hardening (this session)
`generation_engine._replicate_predict` now: picks the correct endpoint (OFFICIAL
models like `black-forest-labs/flux-schnell` use `/v1/models/{owner}/{name}/
predictions`; COMMUNITY models like flux-pulid use versioned `/v1/predictions`,
auto-falling-back on 404); **retries E9828** ("Director: unexpected error", a
transient infra failure); and **backs off on 429** honouring `Retry-After` (rapid
testing rate-limits the account — the worker recovered automatically and completed).

### New in the admin CMS
- **Create-a-book** modal on `/admin/stories` (POST /admin/stories, cover upload,
  slug auto-gen) + an "Author pages" deep-link (`/admin/pages?slug=`).
- **Generate base art (AI)** button in the Page Editor + `POST
  /admin/stories/{slug}/pages/{n}/generate-base` (flux txt2img → saves
  `baseImageUrl`) for the future face-swap/inpaint path.
- **`GET /config`** exposes `freePreviewPages`/`totalPages` — the single source of
  truth the frontend (preview page, FlipBook, Paywall) now reads.
- The 6 placeholder SVG demo stories are **hidden** (seed also seeds them hidden);
  `yahyas-treehouse-adventure` exists as one real 3-page demo book.

## CURRENT STATE OF GPU (Replicate) — ✅ WORKING

- `GPU_PROVIDER=replicate`, `zsxkib/flux-pulid` (version auto-resolved), face sent
  as data-URI (no S3). **Confirmed working end-to-end**: a real identity-preserving
  image renders and is served (`https://replicate.delivery/.../output_1.webp`).
- Notes learned: use `output_format="webp"` (the model does `.upper()`, so "jpg"
  breaks PIL); billing must be enabled; token must be current (regenerating on
  Replicate invalidates the old one). `_smoke.py` removed after passing.
- Still TODO: confirm the same works through the *real app flow* (job → worker →
  preview pages), i.e. step 2 below. render_page() is proven; the worker just
  loops it. Each preview = FREE_PREVIEW_PAGES Replicate renders (a few cents).

## NEXT STEPS (for Claude Code to complete)

1. **Confirm first real render** — once Replicate billing is enabled, run
   `docker compose exec -T api python _smoke.py`; expect `RESULT IMAGE URL … PASS`.
   Then delete `_smoke.py`.
2. **Wire GPU into the real app flow** — the pipeline (`tasks.py` → `render_page`)
   already calls the replicate branch. Author a story's pages in `/admin/pages`
   (scene/style prompt + `{{name}}` text), run a storefront preview end to end,
   confirm real faces + burned text appear in the flip-book. Tune the prompt +
   `id_weight`/`guidance_scale` in `_replicate_run` for likeness vs. style.
3. **Consistent illustration style on Replicate** — flux-pulid is txt2img, so
   page-to-page consistency comes from strong, templated `scenePrompt`/`stylePrompt`
   per page (fixed style tokens + seed). For true fixed-scene inpaint, see step 6.
4. **Align free-page count** — backend `FREE_PREVIEW_PAGES` (currently 5 in `.env`)
   vs. frontend `FlipBook` `FREE_PAGES=13`/Paywall copy. Single source of truth
   (expose backend value via `/config` and read it in the frontend).
5. **Razorpay go-live** — real keys + webhook `…/payments/webhook` (payment.captured);
   wire `/payments/verify` into checkout success; store `razorpayOrderId` at
   create-order time so the webhook can match orders.
6. **(Cost, post-launch) Pinned self-hosted RunPod Serverless** — Dockerfile +
   handler.py that pins ComfyUI + PuLID-Flux (lldacing) + torch to versions known
   to sample correctly (unlike the bleeding-edge Jarvis template). Enables the
   inpaint-over-template path (`build_inpaint_graph`, already written) + ₹0.30/frame.
   Set `GPU_PROVIDER=runpod`.
7. **Real illustrations** — replace `/public/covers/*.svg` placeholders; author 28
   base-art pages per book (needed for the inpaint path in step 6).
8. **Remaining Diffrun features** — "regenerate a face" action + "approve for print"
   gate, order-tracking emails, PDF download delivery link on the order page.
9. **Cleanup** — remove `_smoke.py`; the legacy `providers.py` graph is unused now
   that `generation_engine.py` is the single path — delete or fold in.

### GPU provider matrix (in `generation_engine.py`)
`mock` (default, placeholders) · `replicate` (ACTIVE — hosted flux-pulid, txt2img) ·
`comfyui` (self-hosted, inpaint+FaceDetailer, parked on Jarvis) · `runpod`
(serverless, for the pinned cost build).

---

## Key files

```
apps/api/app/
  generation_engine.py   # FLUX+PuLID+FaceDetailer graph, providers, embed-once, ComfyUI bridge
  text_layer.py          # Pillow story-text burn
  pdf_service.py         # CMYK print PDF
  tasks.py               # Celery: preview 1-13, purchase 14-28, purge cron
  routers/{jobs,orders,payments,admin,uploads,stories}.py
  prisma/schema.prisma
apps/web/src/
  components/{FlipBook,Paywall,PersonalizeWizard,PricingTier,...}.tsx
  app/(storefront)/{page,stories,preview,cart,checkout,order}/...
  app/admin/{page,orders,stories,pages}/...
  lib/{api,admin,cart,razorpay,data,types}.ts
docker-compose.yml, apps/api/.env
```
