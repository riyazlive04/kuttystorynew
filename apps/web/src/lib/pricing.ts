"use client";

// Flat per-format pricing, kept out of the Paywall component so the cart store
// can reprice a line when the customer switches format without importing UI.
export const PDF_PRICE = 799;
export const PRINT_PRICE = 1299;

export function priceFor(format: "pdf" | "print"): number {
  return format === "pdf" ? PDF_PRICE : PRINT_PRICE;
}

export function formatLabel(format: "pdf" | "print"): string {
  return format === "pdf" ? "PDF" : "Hardcover";
}
