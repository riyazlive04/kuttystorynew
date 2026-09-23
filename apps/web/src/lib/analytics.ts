// Everything the site reports about itself, in one place.
//
// Tags live in Google Tag Manager, not in this codebase: GA4 and the Meta
// Pixel are both configured there, so marketing can add or retune a tag
// without a deploy. What GTM cannot do is know what happened — it only sees
// what the app pushes onto `dataLayer`. That push is this file's whole job.
//
// Three things deliberately stay here rather than moving into GTM, because
// getting them wrong costs real money:
//
//   1. Purchase de-duplication. GTM fires on every page load; a refreshed
//      order page would count the sale twice and teach Meta's bidding the
//      wrong price for a customer.
//   2. Route-change page views. This is a single-page app, so the document
//      never reloads between the story, the preview and the checkout. GTM's
//      History Change trigger can see the URL move but not whether the new
//      screen has finished resolving.
//   3. Event shape. GA4 wants `items[]`, Meta wants `content_ids`/`contents`.
//      Deriving one from the other inside GTM means untestable Custom JS;
//      emitting both from the one source of truth means they cannot drift.

export const CURRENCY = "INR";

type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: Params[];
  }
}

/** Commerce steps, named as GA4 names them so the standard reports populate. */
export type CommerceEvent =
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "purchase";

/** Everything else worth knowing, including the KuttyStory-specific steps
 *  that no generic ecommerce schema has a name for. */
export type BehaviourEvent =
  | "page_view"
  | "search"
  | "generate_lead"
  | "sign_up"
  | "contact"
  | "personalize_started"
  | "personalize_step_completed"
  | "photo_uploaded"
  | "photo_upload_failed"
  | "preview_ready"
  | "preview_failed";

export type AnalyticsEvent = CommerceEvent | BehaviourEvent;

/**
 * Meta's own event names. Only the ones on this list can be optimised for and
 * reported on in Ads Manager; anything absent is sent as a custom event, which
 * still builds audiences but cannot be a campaign objective.
 */
const META_STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  page_view: "PageView",
  view_item: "ViewContent",
  search: "Search",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  generate_lead: "Lead",
  sign_up: "CompleteRegistration",
  contact: "Contact",
};

/** One line of the order, in the only shape the rest of the app has to know. */
export type Line = {
  storySlug: string;
  storyTitle?: string;
  quantity: number;
  unitPrice: number;
  /** Hardcover, softcover, PDF — the single biggest driver of margin. */
  format?: string;
  language?: string;
};

function push(payload: Params) {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  } catch {
    // Reporting must never break the page it is reporting on.
  }
}

/**
 * A per-event id, so that a Conversions API call made later from the server can
 * be matched to this browser event instead of counting the same sale twice.
 * Cheap to emit now; impossible to backfill once the events are already sent.
 */
function eventId(seed?: string) {
  return seed ?? `${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
}

function ga4Items(lines: Line[]) {
  return lines.map((l) => ({
    item_id: l.storySlug,
    item_name: l.storyTitle,
    item_category: l.format,
    item_variant: l.language,
    price: l.unitPrice,
    quantity: l.quantity,
  }));
}

function metaParams(lines: Line[], value?: number, extra?: Params) {
  return {
    content_type: "product",
    content_ids: lines.map((l) => l.storySlug),
    contents: lines.map((l) => ({
      id: l.storySlug,
      quantity: l.quantity,
      item_price: l.unitPrice,
    })),
    num_items: lines.reduce((n, l) => n + l.quantity, 0),
    ...(lines[0]?.storyTitle ? { content_name: lines[0].storyTitle } : {}),
    ...(lines[0]?.format ? { content_category: lines[0].format } : {}),
    ...(value !== undefined ? { value, currency: CURRENCY } : {}),
    ...extra,
  };
}

/**
 * A step of the funnel that involves a book and a price.
 *
 * GA4 keeps the last `ecommerce` object it was given, so it has to be cleared
 * first — otherwise items from the story page leak into the purchase and the
 * revenue report quietly counts things nobody bought.
 */
export function trackCommerce(
  event: CommerceEvent,
  opts: { lines: Line[]; value?: number; id?: string; extra?: Params },
) {
  const { lines, value, id, extra } = opts;
  push({ ecommerce: null });
  push({
    event,
    event_id: eventId(id),
    ecommerce: {
      currency: CURRENCY,
      ...(value !== undefined ? { value } : {}),
      ...(id ? { transaction_id: id } : {}),
      items: ga4Items(lines),
      ...extra,
    },
    meta: {
      event_name: META_STANDARD[event],
      standard: true,
      params: metaParams(lines, value, extra),
    },
  });
}

/** A step of the funnel that has no cart attached to it. */
export function track(event: BehaviourEvent, params?: Params) {
  const standard = META_STANDARD[event];
  push({
    event,
    event_id: eventId(),
    ...params,
    meta: {
      event_name: standard ?? event,
      standard: Boolean(standard),
      params: params ?? {},
    },
  });
}

/**
 * True the first time it is asked about a given `key`, false forever after.
 *
 * Some things happen once however many times their page is opened. An order
 * page is a link customers reopen — from the WhatsApp confirmation, from
 * email, months later to re-download the PDF — and a preview that finished
 * rendering did not finish again because they refreshed to look at it.
 */
function firstTime(key: string) {
  if (typeof window === "undefined") return false;
  const storageKey = `kutty:analytics:${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return false;
    window.localStorage.setItem(storageKey, "1");
  } catch {
    // Private mode or blocked storage: send it rather than lose the event.
  }
  return true;
}

/** As `track`, but at most once per `key` per browser. */
export function trackOnce(key: string, event: BehaviourEvent, params?: Params) {
  if (firstTime(key)) track(event, params);
}

/**
 * As `trackCommerce`, but at most once per `key` per browser. Purchase above
 * all: every reopened order link would otherwise be counted as a fresh sale,
 * and Meta bids on that number.
 */
export function trackCommerceOnce(
  key: string,
  event: CommerceEvent,
  opts: { lines: Line[]; value?: number; id?: string; extra?: Params },
) {
  if (firstTime(key)) trackCommerce(event, opts);
}
