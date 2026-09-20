// Meta (Facebook) Pixel.
//
// One wrapper so no component has to know about `window.fbq`, and so a missing
// pixel (ad-blocker, local dev, the script still loading) is a no-op rather
// than a crash inside a checkout handler.
//
// The id can be overridden per environment with NEXT_PUBLIC_META_PIXEL_ID;
// without it the live KuttyStory pixel is used, which is what every deploy
// wants.
export const PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || "28079470835079445";

export const CURRENCY = "INR";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
  }
}

type Params = Record<string, unknown>;

/** Meta's own event names. Standard events are what Ads Manager can optimise
 *  for and report on; anything else has to be a custom event. */
export type StandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Lead"
  | "CompleteRegistration"
  | "Contact";

function fbq(...args: unknown[]) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    window.fbq(...args);
  } catch {
    // Reporting must never break the page it is reporting on.
  }
}

export function track(event: StandardEvent, params?: Params) {
  fbq("track", event, params);
}

export function trackCustom(event: string, params?: Params) {
  fbq("trackCustom", event, params);
}

/**
 * Events that must fire exactly once per thing, no matter how often the page is
 * reopened or refreshed — Purchase above all, which is counted as revenue.
 * Remembered per browser, so a refreshed order page doesn't double-count a sale.
 */
export function trackOnce(key: string, event: StandardEvent, params?: Params) {
  if (typeof window === "undefined") return;
  const storageKey = `fbq:${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Private mode / blocked storage: send it rather than lose the conversion.
  }
  track(event, params);
}

/** Cart lines → the content fields Meta expects on commerce events. */
export function contentsFrom(
  items: { storySlug: string; quantity: number; unitPrice: number }[],
) {
  return {
    content_type: "product",
    content_ids: items.map((i) => i.storySlug),
    contents: items.map((i) => ({
      id: i.storySlug,
      quantity: i.quantity,
      item_price: i.unitPrice,
    })),
    num_items: items.reduce((n, i) => n + i.quantity, 0),
  };
}
