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
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
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

export interface AdminSettings {
  faceOutlineEnabled: boolean;
  segmind: { set: boolean; last4: string; source: "admin" | "env" | null };
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
  printApproved: boolean;
  purged: boolean;
  renderedFreePages: number;
  previewReady: boolean;
  createdAt: string;
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
  kind?: PageKind; // derived server-side from the reserved page numbers
  label?: string;
}

// Reserved page numbers: the covers are ordinary page templates that render
// through the same face-swap + text pipeline as a story page.
export const FRONT_COVER = 0;
export const BACK_COVER = -1;

// A font the PIL text layer can burn in (GET /admin/fonts).
export interface AdminFont {
  key: string;
  label: string;
  css: string;
  installed: boolean;
}

export const adminApi = {
  stats: (): Promise<AdminStats> => req("/admin/stats"),
  orders: (status?: string): Promise<Order[]> =>
    req(`/admin/orders${status ? `?status=${status}` : ""}`),
  setOrderStatus: (id: string, status: string): Promise<Order> =>
    req(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteOrder: (id: string): Promise<{ ok: boolean; id: string }> =>
    req(`/admin/orders/${id}`, { method: "DELETE" }),
  jobs: (purchased?: boolean): Promise<AdminJob[]> =>
    req(
      `/admin/jobs${purchased === undefined ? "" : `?purchased=${purchased}`}`,
    ),
  getSettings: (): Promise<AdminSettings> => req("/admin/settings"),
  updateSettings: (patch: {
    faceOutlineEnabled?: boolean;
    segmindApiKey?: string;
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
  fonts: (): Promise<AdminFont[]> => req("/admin/fonts"),
  pages: (slug: string): Promise<AdminPage[]> =>
    req(`/admin/stories/${slug}/pages`),
  upsertPage: (slug: string, page: AdminPage): Promise<AdminPage> =>
    req(`/admin/stories/${slug}/pages`, {
      method: "POST",
      body: JSON.stringify(page),
    }),
  deletePage: (slug: string, pageNumber: number): Promise<{ ok: boolean }> =>
    req(`/admin/stories/${slug}/pages/${pageNumber}`, { method: "DELETE" }),
  // Generate a page's generic base illustration once (flux txt2img). Costs 1 render.
  generateBase: (slug: string, pageNumber: number, prompt?: string): Promise<AdminPage> =>
    req(`/admin/stories/${slug}/pages/${pageNumber}/generate-base`, {
      method: "POST",
      body: JSON.stringify({ prompt: prompt ?? null }),
    }),
  // Author a full personalized story for the book via an LLM (1 call). Returns
  // the generated pages (also saved as PageTemplates).
  generateStory: (
    slug: string,
    opts: { numPages: number; premise?: string; gender?: string },
  ): Promise<{ provider: string; count: number; pages: AdminPage[] }> =>
    req(`/admin/stories/${slug}/generate-story`, {
      method: "POST",
      body: JSON.stringify(opts),
    }),
  // Generate the FIXED base illustration for every page of the book (background).
  generateBaseArt: (
    slug: string,
    overwrite = false,
  ): Promise<{ ok: boolean; pages: number; status: string }> =>
    req(`/admin/stories/${slug}/generate-base-art`, {
      method: "POST",
      body: JSON.stringify({ overwrite }),
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
