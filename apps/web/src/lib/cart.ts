"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "./types";
import { priceFor } from "./pricing";
import { validatePromo } from "./api";

// Local fallback for the pure front-end demo (no backend). This is the PUBLIC
// code only — private codes are known solely to the server, which is what keeps
// them out of the JS bundle.
const LOCAL_PROMO_CODE = "STORY20";
const LOCAL_PROMO_MIN_ITEMS = 2;
const LOCAL_PROMO_RATE = 0.2;

// Any change to the cart invalidates a priced discount, so the code has to be
// re-applied. Cheaper than silently carrying a discount that no longer matches
// what's in the basket.
const PROMO_RESET = { promoCode: null as string | null, promoDiscount: 0 };

interface CartState {
  items: CartItem[];
  /** The raw code the shopper typed. Sent back to the server at order time so
   *  it can re-derive the discount rather than trusting our number. */
  promoCode: string | null;
  /** Discount in rupees, as priced by the server. */
  promoDiscount: number;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setFormat: (id: string, format: CartItem["format"]) => void;
  clear: () => void;
  applyPromo: (code: string) => Promise<{ ok: boolean; message: string }>;
  removePromo: () => void;
  subtotal: () => number;
  discount: () => number;
  total: () => number;
  count: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      ...PROMO_RESET,
      add: (item) =>
        set((s) => {
          const existing = s.items.find(
            (i) =>
              i.jobId === item.jobId &&
              i.format === item.format &&
              i.language === item.language,
          );
          if (existing) {
            return {
              ...PROMO_RESET,
              items: s.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
            };
          }
          return { ...PROMO_RESET, items: [...s.items, item] };
        }),
      remove: (id) =>
        set((s) => ({
          ...PROMO_RESET,
          items: s.items.filter((i) => i.id !== id),
        })),
      setQty: (id, qty) =>
        set((s) => ({
          ...PROMO_RESET,
          items: s.items.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(1, qty) } : i,
          ),
        })),
      // Switching PDF <-> hardcover reprices the line. The id encodes the
      // format, so it changes too — and if the cart already holds the same book
      // in the target format the two lines merge rather than sitting as
      // duplicates the customer has to reconcile.
      setFormat: (id, format) =>
        set((s) => {
          const line = s.items.find((i) => i.id === id);
          if (!line || line.format === format) return {};
          const nextId = `${line.jobId}-${format}`;
          const twin = s.items.find((i) => i.id !== id && i.id === nextId);
          if (twin) {
            return {
              ...PROMO_RESET,
              items: s.items
                .filter((i) => i.id !== id)
                .map((i) =>
                  i.id === nextId
                    ? { ...i, quantity: i.quantity + line.quantity }
                    : i,
                ),
            };
          }
          return {
            ...PROMO_RESET,
            items: s.items.map((i) =>
              i.id === id
                ? { ...i, id: nextId, format, unitPrice: priceFor(format) }
                : i,
            ),
          };
        }),
      clear: () => set({ items: [], ...PROMO_RESET }),
      applyPromo: async (code) => {
        const normalized = code.trim().toUpperCase();
        if (!normalized) return { ok: false, message: "Enter a code." };

        const subtotal = get().subtotal();
        const quantity = get().count();

        const priced = await validatePromo(normalized, subtotal, quantity);

        // No backend — pure front-end demo. Only the public code exists here.
        if (priced === null) {
          if (normalized !== LOCAL_PROMO_CODE) {
            return { ok: false, message: "That code isn't valid." };
          }
          if (quantity < LOCAL_PROMO_MIN_ITEMS) {
            return {
              ok: false,
              message: `Add ${LOCAL_PROMO_MIN_ITEMS}+ books to use ${LOCAL_PROMO_CODE}.`,
            };
          }
          set({
            promoCode: LOCAL_PROMO_CODE,
            promoDiscount: Math.round(subtotal * LOCAL_PROMO_RATE),
          });
          return { ok: true, message: "20% discount applied! 🎉" };
        }

        if (!priced.ok) return { ok: false, message: priced.message };

        set({ promoCode: normalized, promoDiscount: priced.discount });
        return { ok: true, message: priced.message };
      },
      removePromo: () => set({ ...PROMO_RESET }),
      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      // Clamped: a persisted discount can never exceed what's in the basket,
      // so a restored session can't produce a negative total.
      discount: () => Math.min(get().promoDiscount, get().subtotal()),
      total: () => get().subtotal() - get().discount(),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: "kutty:cart" },
  ),
);
