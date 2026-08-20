/**
 * Shared bits of the "under construction" gate.
 *
 * The gate is driven entirely by SITE_GATE_PASSWORD. When that env var is
 * absent the gate is OFF and the site behaves exactly as it always has — so
 * local dev and any environment that hasn't opted in are unaffected.
 */

export const GATE_COOKIE = "ks_site_access";
export const GATE_PATH = "/site-access";
export const UNLOCK_PATH = "/site-access/unlock";

/** 30 days — long enough that the client isn't retyping it every visit. */
export const GATE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Cookie value is SHA-256 of the password, never the password itself, so the
 * shared secret can't be read back out of a browser's cookie jar.
 *
 * Uses Web Crypto rather than node:crypto because this runs in BOTH the edge
 * middleware and the Node route handler; `crypto.subtle` is the one API
 * present in both.
 */
export async function gateToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`kuttystory-site-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time compare. Callers pass equal-length hex digests, so this never
 * short-circuits on length and leaks nothing through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
