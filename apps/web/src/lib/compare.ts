"use client";

const API = process.env.NEXT_PUBLIC_API_URL;

export interface CompareTile {
  id: string;
  label: string;
  url: string | null;
  error?: string;
  /** Admin-only. Absent for storefront callers. */
  ms?: number;
  estCostUsd?: number | null;
}

export interface CompareResult {
  storySlug: string;
  pageNumber: number;
  variant: string;
  basePlateUrl: string | null;
  photoUrl: string | null;
  tiles: CompareTile[];
}

/** Relative "/uploads/..." paths are served by the API host, not the web host. */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.startsWith("/uploads/") ? `${API}${url}` : url;
}

export const compareConfigured = Boolean(API);

/**
 * Run one demo page through every configured image provider.
 *
 * Pass `adminToken` to get vendor names, timings and indicative costs back, and
 * to bypass the per-IP rate limit. Anonymous callers get neutral "Style A/B"
 * labels and a limited number of tries.
 */
export async function compareProviders(opts: {
  file: File;
  slug: string;
  variant?: string;
  adminToken?: string;
}): Promise<CompareResult> {
  if (!API) throw new Error("Backend not configured (set NEXT_PUBLIC_API_URL).");
  const body = new FormData();
  body.append("file", opts.file);
  body.append("slug", opts.slug);
  body.append("variant", opts.variant || "boy");

  const res = await fetch(`${API}/compare`, {
    method: "POST",
    body, // no Content-Type — the browser sets the multipart boundary
    headers: opts.adminToken ? { Authorization: `Bearer ${opts.adminToken}` } : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res
      .json()
      .then((j) => (typeof j?.detail === "string" ? j.detail : null))
      .catch(() => null);
    if (res.status === 429) {
      throw new Error(detail || "You've used your free tries for now.");
    }
    throw new Error(detail || `Comparison failed (${res.status})`);
  }
  return res.json();
}
