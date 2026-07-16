# KuttyStory 📖✨

Personalized AI storybooks that make **your child the hero** — a production-grade
rebuild inspired by [diffrun.com](https://diffrun.com), tuned for India (English +
Tamil, Razorpay, free nationwide delivery).

Upload a photo → pick a story → get a free 8-page preview instantly → buy the
full **instant PDF** or a **premium printed hardcover**.

---

## Architecture

```
[ NEXT.JS 14 FRONTEND ]  Storefront + personalization wizard + checkout
          │  REST / JSON
          ▼
[ FASTAPI (PYTHON) ]  ──►  [ POSTGRESQL + PRISMA ]
          │  enqueue
          ▼
[ CELERY WORKERS + REDIS ]  ──►  [ COMFYUI API NODE ]  (RunPod / Replicate GPU)
```

| Layer      | Tech                                             |
| ---------- | ------------------------------------------------ |
| Frontend   | Next.js 14 (App Router), TypeScript, Tailwind, Zustand, lucide-react |
| Backend    | FastAPI, Pydantic v2                             |
| Database   | PostgreSQL + Prisma (Python client)             |
| Async jobs | Celery + Redis                                   |
| GPU render | ComfyUI adapter (RunPod / Replicate) — mockable  |
| Payments   | Razorpay (UPI / cards / netbanking)              |
| Analytics  | Google Tag Manager (opt-in via env)             |
| Proxy      | Nginx (production)                               |

### Why this beats the reference stack
- **Razorpay, not PayPal** — lower fees + native UPI for the India market.
- **Postgres + Prisma** — a real, typed, migratable data model (stories, jobs, orders).
- **Celery/Redis queue** — GPU renders scale horizontally; the web tier never blocks.
- **Pluggable GPU adapter** — swap RunPod ↔ Replicate ↔ self-hosted ComfyUI in one file.
- **Stable Next.js LTS** (not a canary) — predictable production behavior.
- **Runs with zero credentials** — mock payment + mock render make the whole flow demoable offline.

---

## Quick start

### Option A — Frontend only (fastest, no backend needed)

The frontend ships with a **built-in mock API** (client-side), so it runs
end-to-end — personalize, live preview, cart, checkout, order confirmation —
without any backend, database, or keys.

```bash
npm install
npm run dev          # http://localhost:3000
```

### Option B — Full stack with Docker

Brings up Postgres, Redis, FastAPI, a Celery worker, and the web app. The DB is
auto-seeded with the story catalogue on first boot.

```bash
cp apps/api/.env.example apps/api/.env      # optional: add Razorpay / GPU keys
docker compose up --build
# web  → http://localhost:3000
# api  → http://localhost:8000  (Swagger at /docs)
```

Production reverse proxy (single origin on :80):

```bash
docker compose --profile prod up --build
```

### Option C — Run services manually

```bash
# 1. Postgres + Redis (via docker or local installs)
docker compose up -d db redis

# 2. Backend
cd apps/api
python -m venv .venv && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
prisma db push          # create tables
python -m app.seed      # seed stories
uvicorn app.main:app --reload --port 8000

# 3. Celery worker (new terminal)
celery -A app.worker.celery_app worker --loglevel=info

# 4. Frontend (new terminal)
cd apps/web
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

---

## Environment variables

**Frontend** (`apps/web/.env.local`)

| Var                         | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`       | FastAPI base URL. Unset → built-in mock API.       |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay public key. Unset → mock payment.       |
| `NEXT_PUBLIC_GTM_ID`        | Google Tag Manager container ID (optional).        |

**Backend** (`apps/api/.env`) — see `apps/api/.env.example`. All of Razorpay and
ComfyUI are optional; blank values enable mock mode.

---

## Going live with the real GPU pipeline

The rendering pipeline is isolated in [`apps/api/app/comfyui.py`](apps/api/app/comfyui.py).
Set `COMFYUI_BASE_URL` + `COMFYUI_API_KEY` to point at a ComfyUI API node on
RunPod/Replicate, and implement your face-personalization workflow in
`render_page()`. The Celery task in `app/tasks.py` already streams per-page
progress into Postgres so the preview screen updates live.

---

## API surface

| Method | Path                     | Description                        |
| ------ | ------------------------ | --------------------------------- |
| GET    | `/stories`               | List active stories               |
| GET    | `/stories/{slug}`        | Story detail                      |
| POST   | `/jobs`                  | Create a personalization + render |
| GET    | `/jobs/{id}`             | Poll render status + pages        |
| POST   | `/orders`                | Create an order (server-priced)   |
| GET    | `/orders/{id}`           | Order detail                      |
| POST   | `/payments/create-order` | Create a Razorpay order           |
| POST   | `/payments/verify`       | Verify signature, mark paid       |
| POST   | `/payments/webhook`      | Razorpay webhook                  |
| GET    | `/health`                | Liveness + mode flags             |

---

## Project layout

```
KuttyStory_New/
├── apps/
│   ├── web/            # Next.js frontend
│   │   └── src/
│   │       ├── app/        # routes (home, stories, preview, cart, checkout, order)
│   │       ├── components/  # StoryCard, PricingTier, PersonalizeWizard, ...
│   │       └── lib/         # api client, cart store, razorpay, tokens
│   └── api/            # FastAPI backend
│       ├── app/
│       │   ├── routers/     # stories, jobs, orders, payments
│       │   ├── comfyui.py   # GPU adapter (mockable)
│       │   ├── tasks.py     # Celery render pipeline
│       │   └── main.py
│       └── prisma/schema.prisma
├── infra/nginx/       # production reverse proxy
└── docker-compose.yml
```

---

_Made with ♥ for little readers._
