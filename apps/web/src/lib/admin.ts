"use client";

import type { Order, PageKind } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL;
const TOKEN_KEY = "kutty:adminToken";

export const adminConfigured = Boolean(API);

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function req(path: string, init: RequestInit = {}) {
  if (!API) throw new Error("Backend not configured (set NEXT_PUBLIC_API_URL).");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Unauthorized - check your admin token.");
  if (!res.ok) {
    // Surface the backend's `detail` message (e.g. why a delete was blocked).
    const detail = await res
      .json()
      .then((j) => (typeof j?.detail === "string" ? j.detail : null))
      .catch(() => null);
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export interface AdminStats {
  orders: number;
  paidOrders: number;
  revenue: number;
  jobs: number;
  stories: number;
}

export interface AdminStory {
  id: string;
  slug: string;
  title: string;
  categoryTag: string;
  ageRange: string;
  pdfPrice: number;
  printPrice: number;
  coverImage: string;
  supportsTamil: boolean;
  active: boolean;
  genderLock?: Variant | null; // null = offered for any child
  minAge?: number;
  maxAge?: number;
}

// Payload for creating a book via POST /admin/stories (matches StoryUpsert).
export interface StoryCreate {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  categoryTag: string;
  ageRange: string;
  minAge: number;
  maxAge: number;
  pdfPrice: number;
  printPrice: number;
  pages: number;
  coverImage: string;
  supportsTamil: boolean;
}

export type ImageProvider = "segmind" | "openai";

export interface ProviderKeyStatus {
  set: boolean;
  last4: string;
  source: "admin" | "env" | null;
}

export interface AdminSettings {
  faceOutlineEnabled: boolean;
  whatsappNumber: string;
  imageProvider: ImageProvider;
  segmind: ProviderKeyStatus;
  openai: ProviderKeyStatus;
}

export interface AdminJob {
  id: string;
  childName: string;
  storyTitle: string;
  storySlug: string;
  language: string;
  status: string;
  progress: number;
  isPurchased: boolean;
  isTest?: boolean;
  printApproved: boolean;
  purged: boolean;
  renderedFreePages: number;
  previewReady: boolean;
  /** Why the last render failed (or which pages did), in plain words. */
  error?: string | null;
  createdAt: string;
}

/** The photographs a parent uploaded, and when they are due to be deleted. */
export interface AdminJobPhotos {
  jobId: string;
  childName: string;
  photoUrls: string[];
  purged: boolean;
  /** Null once purged, or when the session has no retention date yet. */
  deletedAt: string | null;
}

export interface AdminPage {
  id?: string;
  bookTemplateId?: string;
  pageNumber: number;
  baseImageUrl?: string | null;
  stylePrompt: string;
  faceX?: number | null;
  faceY?: number | null;
  faceW?: number | null;
  faceH?: number | null;
  facePath?: number[][] | null; // freeform mask polygon [[x%,y%], ...]
  scenePrompt: string;
  storyText: string;
  textX: number;
  textY: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  letterSpacing: number;
  softLineBreak: boolean;
  outlineWidth: number; // px @1024; 0 = no outline
  warpStyle: "none" | "arc";
  warpBend: number;      // -100..100
  warpDistortH: number;  // -100..100
  warpDistortV: number;  // -100..100
  warpVertical: boolean;
  textBlocks?: TextBlock[];
  textBox?: TextBox;
  variant?: Variant; // which gender's artwork this page belongs to
  kind?: PageKind; // derived server-side from the reserved page numbers
  label?: string;
}

// One styled row of text. A page holds a list of them, so a cover can stack
// rows in different fonts, colours and sizes.
export interface TextBlock {
  text: string;
  textX: number;
  textY: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  letterSpacing: number;
  softLineBreak: boolean;
  outlineWidth: number;
  outlineColor: string; // "" = auto-contrast against the text colour
  outline2Width: number; // wider second ring drawn outside the first; 0 = off
  outline2Color: string;
  shadow: boolean;
  warpStyle: "none" | "arc";
  warpBend: number;
  warpDistortH: number;
  warpDistortV: number;
  warpVertical: boolean;
}

// ONE panel behind all of a page's rows — the box frames the whole text.
export interface TextBox {
  enabled: boolean;
  color: string;
  opacity: number;   // 0-100
  padding: number;   // px @1024
  radius: number;    // px @1024
  fullWidth: boolean;
}

export const BLANK_BOX = (): TextBox => ({
  enabled: false,
  color: "#FFFFFF",
  opacity: 70,
  padding: 26,
  radius: 22,
  fullWidth: false,
});

export const BLANK_BLOCK = (y = 50): TextBlock => ({
  text: "",
  textX: 50,
  textY: y,
  fontSize: 64,
  fontColor: "#FFFFFF",
  fontFamily: "sans",
  letterSpacing: 0,
  softLineBreak: true,
  outlineWidth: 4,
  outlineColor: "",
  outline2Width: 0,
  outline2Color: "#FFFFFF",
  shadow: true,
  warpStyle: "none",
  warpBend: 0,
  warpDistortH: 0,
  warpDistortV: 0,
  warpVertical: false,
});

// A book is authored once per gender — separate base art, separate face
// outlines. The Page Editor switches between them with the Boy / Girl buttons.
export type Variant = "boy" | "girl";
export const VARIANTS: Variant[] = ["boy", "girl"];

// Reserved page numbers: the covers are ordinary page templates that render
// through the same face-swap + text pipeline as a story page.
export const FRONT_COVER = 0;
export const BACK_COVER = -1;
// Print-only: the strip between the covers on the printed wrap. Authored like a
// page but never shown to the customer and never part of the interior PDF.
export const SPINE = -2;

// A font the PIL text layer can burn in (GET /admin/fonts).
export interface AdminFont {
  key: string;
  label: string;
  css: string;
  installed: boolean;
  custom?: boolean; // admin-installed, living on the storage volume
}

export interface AutoTraceRun {
  variant: string;
  state: "idle" | "running" | "done" | "failed";
  total?: number | null; // pages to trace; null until the run has listed them
  done?: number;
  traced?: number;
  current?: number | null; // page number being traced right now
  error?: string | null;
  pages?: {
    pageNumber: number;
    status: "traced" | "failed" | "already traced" | "no base art";
    points?: number;
    detail?: string;
    creditsLeft?: string | null;
  }[];
}

export const adminApi = {
  stats: (): Promise<AdminStats> => req("/admin/stats"),
  orders: (status?: string): Promise<Order[]> =>
    req(`/admin/orders${status ? `?status=${status}` : ""}`),
  setOrderStatus: (id: string, status: string, force = false): Promise<Order> =>
    req(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, force }),
    }),
  /** Save courier + tracking number; the API emails the customer when asked. */
  setTracking: (
    id: string,
    body: {
      courier: string;
      trackingNumber: string;
      trackingUrl?: string;
      notify?: boolean;
      markShipped?: boolean;
    },
  ): Promise<Order & { notified: boolean }> =>
    req(`/admin/orders/${id}/tracking`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  /** Email the customer their invoice (numbered on the first send). */
  sendInvoice: (id: string): Promise<Order & { sent: boolean }> =>
    req(`/admin/orders/${id}/invoice`, { method: "POST" }),
  deleteOrder: (id: string): Promise<{ ok: boolean; id: string }> =>
    req(`/admin/orders/${id}`, { method: "DELETE" }),
  jobs: (
    purchased?: boolean,
    offset = 0,
    limit = 25,
  ): Promise<{ items: AdminJob[]; total: number }> =>
    req(
      `/admin/jobs?offset=${offset}&limit=${limit}` +
        (purchased === undefined ? "" : `&purchased=${purchased}`),
    ),
  /** The source photos for one preview session, fetched only on demand. */
  jobPhotos: async (id: string): Promise<AdminJobPhotos> => {
    const res: AdminJobPhotos = await req(`/admin/jobs/${id}/photos`);
    return {
      ...res,
      // Stored relative to the API host. A Next rewrite cannot reach them —
      // rewrites run server-side, in the web container, where the API's
      // hostname is not the one the browser would use.
      photoUrls: res.photoUrls.map((u) =>
        API && u.startsWith("/uploads/") ? `${API}${u}` : u,
      ),
    };
  },
  getSettings: (): Promise<AdminSettings> => req("/admin/settings"),
  updateSettings: (patch: {
    faceOutlineEnabled?: boolean;
    imageProvider?: ImageProvider;
    segmindApiKey?: string;
    openaiApiKey?: string;
    whatsappNumber?: string;
  }): Promise<AdminSettings> =>
    req("/admin/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  stories: (): Promise<AdminStory[]> => req("/admin/stories"),
  createStory: (body: StoryCreate): Promise<AdminStory> =>
    req("/admin/stories", { method: "POST", body: JSON.stringify(body) }),
  toggleStory: (slug: string, active: boolean): Promise<AdminStory> =>
    req(`/admin/stories/${slug}/active?active=${active}`, { method: "PATCH" }),
  deleteStory: (
    slug: string,
    force = false,
  ): Promise<{ ok: boolean; slug: string; forced?: boolean }> =>
    req(`/admin/stories/${slug}${force ? "?force=true" : ""}`, {
      method: "DELETE",
    }),
  /**
   * START tracing face outlines with SAM3; returns immediately. Poll
   * autoTraceStatus for progress.
   *
   * SLOW and PAID: ~150-280s and ~0.38 Segmind credits per page, run
   * sequentially on the server. Pages that already have an outline are skipped
   * unless `overwrite` is set — a hand-traced outline beats a generated one.
   */
  autoTraceFaces: (
    slug: string,
    body: {
      variant: "boy" | "girl";
      pageNumbers?: number[];
      overwrite?: boolean;
    },
  ): Promise<AutoTraceRun> =>
    req(`/admin/stories/${slug}/autotrace`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  autoTraceStatus: (slug: string, variant: "boy" | "girl"): Promise<AutoTraceRun> =>
    req(`/admin/stories/${slug}/autotrace?variant=${variant}`),
  fonts: (): Promise<AdminFont[]> => req("/admin/fonts"),
  // Compose the page's text over its base art with the REAL renderer and hand
  // back a JPEG object URL — no CSS approximation, no AI cost.
  textPreview: async (
    slug: string,
    page: AdminPage,
    variant: Variant = "boy",
  ): Promise<string> => {
    const API = process.env.NEXT_PUBLIC_API_URL;
    if (!API) throw new Error("Backend not configured.");
    const res = await fetch(
      `${API}/admin/stories/${slug}/pages/${page.pageNumber}/text-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ ...page, variant }),
      },
    );
    if (!res.ok) throw new Error("Preview failed");
    return URL.createObjectURL(await res.blob());
  },
  deleteFont: (key: string): Promise<{ ok: boolean; families: AdminFont[] }> =>
    req(`/admin/fonts/${encodeURIComponent(key)}`, { method: "DELETE" }),
  uploadFont: async (
    file: File,
  ): Promise<{ ok: boolean; key: string; families: AdminFont[] }> => {
    const API = process.env.NEXT_PUBLIC_API_URL;
    if (!API) throw new Error("Backend not configured.");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/admin/fonts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    if (!res.ok) {
      const detail = await res
        .json()
        .then((j) => (typeof j?.detail === "string" ? j.detail : null))
        .catch(() => null);
      throw new Error(detail || "Font upload failed");
    }
    return res.json();
  },
  // Render a whole book for review: every page, nothing paywalled.
  testRender: (body: {
    storySlug: string;
    childName: string;
    gender: Variant;
    photoUrl?: string;
  }): Promise<{ ok: boolean; jobId: string; pages: number; variant: Variant }> =>
    req("/admin/test-render", { method: "POST", body: JSON.stringify(body) }),
  setAges: (slug: string, minAge: number, maxAge: number): Promise<AdminStory> =>
    req(`/admin/stories/${slug}/ages`, {
      method: "PATCH",
      body: JSON.stringify({ minAge, maxAge }),
    }),
  setGenderLock: (slug: string, genderLock: Variant | null): Promise<AdminStory> =>
    req(`/admin/stories/${slug}/gender-lock`, {
      method: "PATCH",
      body: JSON.stringify({ genderLock }),
    }),
  pages: (slug: string, variant: Variant = "boy"): Promise<AdminPage[]> =>
    req(`/admin/stories/${slug}/pages?variant=${variant}`),
  upsertPage: (
    slug: string,
    page: AdminPage,
    variant: Variant = "boy",
  ): Promise<AdminPage> =>
    req(`/admin/stories/${slug}/pages`, {
      method: "POST",
      body: JSON.stringify({ ...page, variant }),
    }),
  deletePage: (
    slug: string,
    pageNumber: number,
    variant: Variant = "boy",
  ): Promise<{ ok: boolean }> =>
    req(`/admin/stories/${slug}/pages/${pageNumber}?variant=${variant}`, {
      method: "DELETE",
    }),
  // Generate a page's generic base illustration once (flux txt2img). Costs 1 render.
  generateBase: (
    slug: string,
    pageNumber: number,
    variant: Variant = "boy",
    prompt?: string,
  ): Promise<AdminPage> =>
    req(`/admin/stories/${slug}/pages/${pageNumber}/generate-base`, {
      method: "POST",
      body: JSON.stringify({ prompt: prompt ?? null, variant }),
    }),
  // Author a full personalized story for the book via an LLM (1 call). Returns
  // the generated pages (also saved as PageTemplates).
  generateStory: (
    slug: string,
    opts: { numPages: number; premise?: string; variant?: Variant },
  ): Promise<{ provider: string; count: number; pages: AdminPage[] }> =>
    req(`/admin/stories/${slug}/generate-story`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  // Generate the FIXED base illustration for every page of the book (background).
  generateBaseArt: (
    slug: string,
    variant: Variant = "boy",
    overwrite = false,
  ): Promise<{ ok: boolean; pages: number; status: string }> =>
    req(`/admin/stories/${slug}/generate-base-art`, {
      method: "POST",
      body: JSON.stringify({ overwrite, variant }),
    }),
  upload: async (file: File): Promise<{ url: string }> => {
    const API = process.env.NEXT_PUBLIC_API_URL;
    if (!API) throw new Error("Backend not configured.");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd,
    });
    if (!res.ok) throw new Error("Upload failed");
    const json = await res.json();
    // Absolute URL so both the admin preview and the GPU worker can fetch it.
    return { url: `${API}${json.url}` };
  },
  verifyToken: async (): Promise<boolean> => {
    try {
      await req("/admin/stats");
      return true;
    } catch {
      return false;
    }
  },
};

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "in_production",
  "shipped",
  "delivered",
  "cancelled",
] as const;
