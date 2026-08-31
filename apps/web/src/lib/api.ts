import { STORIES, getStory } from "./data";
import type {
  Job,
  JobStatus,
  Order,
  OrderInput,
  Personalization,
  PreviewPage,
  Story,
} from "./types";

const API = process.env.NEXT_PUBLIC_API_URL;
const JOB_KEY = "kutty:jobs";
const ORDER_KEY = "kutty:orders";

// How long the mock "GPU render" takes end to end (ms).
const MOCK_RENDER_MS = 9000;
const FREE_PREVIEW_PAGES = 3; // pages 1-3 free; paywall at page 4

/* ------------------------------------------------------------------ */
/*  Local persistence helpers (used only in mock / no-backend mode)    */
/* ------------------------------------------------------------------ */

function readMap<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, map: Record<string, T>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(map));
}

function rid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const stamp = Date.now().toString(36).slice(-4);
  return `${prefix}_${stamp}${rand}`;
}

/* ------------------------------------------------------------------ */
/*  Preview page synthesis (mock ComfyUI output)                       */
/* ------------------------------------------------------------------ */

function buildPages(story: Story, childName: string): PreviewPage[] {
  const captions = [
    `Once upon a time there was a wonderful child named ${childName}.`,
    `${childName} woke up ready for an amazing adventure.`,
    `"Today," said ${childName}, "anything is possible!"`,
    `Along the way, ${childName} made a brand new friend.`,
    `Together they discovered a secret hidden in plain sight.`,
    `${childName} was brave, even when things felt a little scary.`,
    `With a big smile, ${childName} solved the puzzle.`,
    `Everyone cheered for ${childName}!`,
  ];
  return Array.from({ length: story.pages }, (_, i) => ({
    index: i,
    imageUrl: story.gallery[i % story.gallery.length] || story.coverImage,
    caption:
      captions[i % captions.length] ||
      `${childName}'s story continues on page ${i + 1}...`,
    locked: i >= FREE_PREVIEW_PAGES,
  }));
}

function deriveMockJob(raw: any): Job {
  // Progress is time-based so it advances across navigations without timers.
  const elapsed = Date.now() - new Date(raw.createdAt).getTime();
  const pct = Math.min(100, Math.round((elapsed / MOCK_RENDER_MS) * 100));
  let status: JobStatus = "queued";
  if (pct >= 100) status = "completed";
  else if (pct >= 60) status = "rendering";
  else if (pct >= 15) status = "processing";
  return { ...raw, progress: pct, status };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface PromoResult {
  ok: boolean;
  discount: number;
  code: string | null;
  message: string;
  total: number;
  /** True when the server was never reached (network error / non-OK response),
   *  as opposed to the server pricing the code and saying no. Callers that
   *  re-check an already-applied code must not drop it over a blip. */
  unreachable?: boolean;
}

/** Price a promo code on the server.
 *
 * Discount rules live server-side so private codes never have to ship in the
 * JS bundle. `null` means there is no backend at all (the pure front-end demo),
 * which the caller handles with its own local fallback.
 */
export async function validatePromo(
  code: string,
  subtotal: number,
  quantity: number,
): Promise<PromoResult | null> {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/promo/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal, quantity }),
    });
    if (!res.ok)
      return {
        ok: false,
        discount: 0,
        code: null,
        message: "Couldn't check that code.",
        total: subtotal,
        unreachable: true,
      };
    return (await res.json()) as PromoResult;
  } catch {
    return {
      ok: false,
      discount: 0,
      code: null,
      message: "Couldn't reach the server.",
      total: subtotal,
      unreachable: true,
    };
  }
}

// What the backend thinks of a photo as a face source. `verdict` is the reason,
// `message` is the sentence to show the parent; both are advisory and never
// block an upload.
export type PhotoQuality = {
  ok: boolean;
  score: number;
  verdict: "good" | "soft" | "blurry" | "small" | "no_face";
  message: string;
  sharpness: number | null;
  faceFraction: number;
};

export type UploadedPhoto = { url: string; quality?: PhotoQuality };

export async function uploadPhoto(
  file: File,
  analyze = false,
): Promise<UploadedPhoto | undefined> {
  // Uploads the child's photo to the backend; returns the rawPhotoUrl and,
  // when asked, what the backend makes of it as a face source.
  // In no-backend mode there's nothing to upload to, so returns undefined.
  if (!API) return undefined;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}/upload${analyze ? "?analyze=true" : ""}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) return undefined;
  const json = await res.json();
  return { url: `${API}${json.url}`, quality: json.quality };
}

// Diffrun-style: re-roll a single page's face with a fresh seed ("fine-tune").
export async function regeneratePage(
  jobId: string,
  pageNumber: number,
): Promise<boolean> {
  if (!API) return false;
  const res = await fetch(`${API}/jobs/${jobId}/pages/${pageNumber}/regenerate`, {
    method: "POST",
  });
  return res.ok;
}

// Approve the finished book for print (required before production).
export async function approveJob(jobId: string): Promise<boolean> {
  if (!API) return false;
  const res = await fetch(`${API}/jobs/${jobId}/approve`, { method: "POST" });
  return res.ok;
}

export async function listStories(): Promise<Story[]> {
  if (API) {
    const res = await fetch(`${API}/stories`, { cache: "no-store" });
    if (res.ok) return res.json();
  }
  return STORIES;
}

export async function fetchStory(slug: string): Promise<Story | undefined> {
  if (API) {
    const res = await fetch(`${API}/stories/${slug}`, { cache: "no-store" });
    if (res.ok) return res.json();
  }
  return getStory(slug);
}

export async function createJob(p: Personalization): Promise<Job> {
  if (API) {
    const res = await fetch(`${API}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
    if (!res.ok) throw new Error("Failed to create job");
    return res.json();
  }

  const story = getStory(p.storySlug);
  if (!story) throw new Error("Unknown story");
  const job: Job = {
    id: rid("job"),
    storySlug: p.storySlug,
    storyTitle: story.title,
    childName: p.childName,
    language: p.language,
    status: "queued",
    progress: 0,
    pages: buildPages(story, p.childName),
    createdAt: new Date().toISOString(),
  };
  const jobs = readMap<Job>(JOB_KEY);
  jobs[job.id] = job;
  writeMap(JOB_KEY, jobs);
  return job;
}

// Worker-composed preview pages are stored as relative "/uploads/..." (served by
// the API host). Absolutize them to the browser-facing API origin so <img> loads
// them directly (a Next rewrite can't — rewrites run server-side in the web
// container where localhost:8000 isn't the API).
function absolutizePages(job: Job): Job {
  if (!API || !job?.pages) return job;
  return {
    ...job,
    pages: job.pages.map((p) =>
      p.imageUrl && p.imageUrl.startsWith("/uploads/")
        ? { ...p, imageUrl: `${API}${p.imageUrl}` }
        : p,
    ),
  };
}

/** Direct link to the generated free-preview PDF (customer + admin download). */
export function previewPdfUrl(jobId: string): string {
  return API ? `${API}/jobs/${jobId}/preview.pdf` : "#";
}

/** Direct link to the full personalized book PDF (after purchase). */
export function bookPdfUrl(jobId: string): string {
  return API ? `${API}/jobs/${jobId}/book.pdf` : "#";
}

/**
 * Reliably download a file cross-origin: fetch as a blob and trigger a save.
 * Avoids the `target="_blank"` + attachment quirk where the new tab opens blank
 * and the download silently fails. Returns false on error (e.g. 409 not ready).
 */
export async function downloadFile(url: string, filename: string): Promise<boolean> {
  if (!url || url === "#") return false;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
    return true;
  } catch {
    return false;
  }
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  if (API) {
    // Distinguish a genuine 404 (job gone → undefined) from a transient failure
    // (network blip / API restart / 5xx). Transient errors THROW so the poller
    // can retry instead of wrongly declaring the preview "not found".
    const res = await fetch(`${API}/jobs/${jobId}`, { cache: "no-store" });
    if (res.ok) return absolutizePages(await res.json());
    if (res.status === 404) return undefined;
    throw new Error(`getJob transient failure: ${res.status}`);
  }
  const jobs = readMap<Job>(JOB_KEY);
  const raw = jobs[jobId];
  return raw ? deriveMockJob(raw) : undefined;
}

/** Hand the Razorpay receipt to the backend, which recomputes the signature
 *  and only then marks our order paid. Without this the order stays pending
 *  until the webhook reconciles it. Returns false when there is no backend. */
export async function verifyPayment(args: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<boolean> {
  if (!API) return false;
  const res = await fetch(`${API}/payments/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: args.orderId,
      razorpay_order_id: args.razorpayOrderId,
      razorpay_payment_id: args.razorpayPaymentId,
      razorpay_signature: args.razorpaySignature,
    }),
  });
  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => (typeof j?.detail === "string" ? j.detail : null))
      .catch(() => null);
    throw new Error(detail || "We could not verify that payment.");
  }
  return true;
}

export async function createOrder(input: OrderInput): Promise<Order> {
  if (API) {
    const res = await fetch(`${API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create order");
    return res.json();
  }
  const order: Order = {
    ...input,
    id: rid("ord").toUpperCase(),
    status: "paid",
    createdAt: new Date().toISOString(),
  };
  const orders = readMap<Order>(ORDER_KEY);
  orders[order.id] = order;
  writeMap(ORDER_KEY, orders);
  return order;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (API) {
    const res = await fetch(`${API}/orders/${id}`, { cache: "no-store" });
    if (res.ok) return res.json();
    return undefined;
  }
  return readMap<Order>(ORDER_KEY)[id];
}

export interface RuntimeConfig {
  freePreviewPages: number;
  totalPages: number;
  faceOutlineEnabled: boolean;
  whatsappNumber: string;
}

// Fallback used when there's no backend (mock mode) or /config is unreachable.
const DEFAULT_CONFIG: RuntimeConfig = {
  freePreviewPages: FREE_PREVIEW_PAGES,
  totalPages: 28,
  faceOutlineEnabled: true,
  whatsappNumber: "",
};

// Single source of truth for the free-page count / paywall copy: the backend's
// FREE_PREVIEW_PAGES (it only renders that many preview pages). Read at runtime.
export async function getConfig(): Promise<RuntimeConfig> {
  if (API) {
    try {
      const res = await fetch(`${API}/config`, { cache: "no-store" });
      if (res.ok) {
        const c = await res.json();
        return {
          freePreviewPages: c.freePreviewPages ?? DEFAULT_CONFIG.freePreviewPages,
          totalPages: c.totalPages ?? DEFAULT_CONFIG.totalPages,
          faceOutlineEnabled:
            c.faceOutlineEnabled ?? DEFAULT_CONFIG.faceOutlineEnabled,
          whatsappNumber: c.whatsappNumber ?? DEFAULT_CONFIG.whatsappNumber,
        };
      }
    } catch {
      /* fall through to default */
    }
  }
  return DEFAULT_CONFIG;
}

export const config = {
  usingBackend: Boolean(API),
  freePreviewPages: FREE_PREVIEW_PAGES,
};
