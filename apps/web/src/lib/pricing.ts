// Plain data + pure helpers, deliberately NOT a "use client" module: the SEO
// builders call priceFor() during server rendering, and a client module's
// exports are client references there, not callable functions.
// Flat per-format pricing, kept out of the Paywall component so the cart store
// can reprice a line when the customer switches format without importing UI.
//
// One price list for every book. The catalogue still carries per-story
// pdfPrice/printPrice columns, but nothing charges from them any more: three
// editions at one price each is what the storefront promises, and two sources of
// truth for a price is how a customer gets billed something the page didn't say.
export const FORMATS = ["pdf", "staple", "print"] as const;
export type Format = (typeof FORMATS)[number];

export const PRICES: Record<Format, number> = {
  pdf: 399,
  staple: 799,
  print: 1299,
};

export const FORMAT_LABELS: Record<Format, string> = {
  pdf: "PDF Version",
  staple: "Staple Bound",
  print: "Hard Cover",
};

// The one-line promise under each option.
export const FORMAT_BLURBS: Record<Format, string> = {
  pdf: "High-res download, ready in minutes",
  staple: "Softcover, stapled spine, shipped free",
  print: "Premium hard cover keepsake, shipped free",
};

export const FORMAT_EMOJI: Record<Format, string> = {
  pdf: "📄",
  staple: "📚",
  print: "🎁",
};

// Kept for the many call sites that only ever meant "the cheapest" and "the
// flagship" edition.
export const PDF_PRICE = PRICES.pdf;
export const STAPLE_PRICE = PRICES.staple;
export const PRINT_PRICE = PRICES.print;

export function isFormat(v: string): v is Format {
  return (FORMATS as readonly string[]).includes(v);
}

export function priceFor(format: Format): number {
  return PRICES[format] ?? PRICES.print;
}

export function formatLabel(format: Format): string {
  return FORMAT_LABELS[format] ?? format;
}

/** Physical editions ship; the PDF does not. */
export function isPrinted(format: Format): boolean {
  return format !== "pdf";
}
