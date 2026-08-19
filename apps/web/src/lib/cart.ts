"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "./types";
import { priceFor } from "./pricing";

export const PROMO_CODE = "STORY20";
const PROMO_MIN_ITEMS = 2;
const PROMO_RATE = 0.2;

interface CartState {
  items: CartItem[];
  promoCode: string | null;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  setFormat: (id: string, format: CartItem["format"]) => void;
  clear: () => void;
  applyPromo: (code: string) => { ok: boolean; message: string };
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
      promoCode: null,
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
              items: s.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
            };
          }
          return { items: [...s.items, item] };
        }),
      remove: (id) =>
        set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setQty: (id, qty) =>
        set((s) => ({
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
            items: s.items.map((i) =>
              i.id === id
                ? { ...i, id: nextId, format, unitPrice: priceFor(format) }
                : i,
            ),
          };
        }),
      clear: () => set({ items: [], promoCode: null }),
      applyPromo: (code) => {
        const normalized = code.trim().toUpperCase();
        if (normalized !== PROMO_CODE) {
          return { ok: false, message: "That code isn't valid." };
        }
        if (get().count() < PROMO_MIN_ITEMS) {
          return {
            ok: false,
            message: `Add ${PROMO_MIN_ITEMS}+ books to use ${PROMO_CODE}.`,
          };
        }
        set({ promoCode: PROMO_CODE });
        return { ok: true, message: "20% discount applied! 🎉" };
      },
      removePromo: () => set({ promoCode: null }),
      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
      discount: () => {
        const s = get();
        if (s.promoCode === PROMO_CODE && s.count() >= PROMO_MIN_ITEMS) {
          return Math.round(s.subtotal() * PROMO_RATE);
        }
        return 0;
      },
      total: () => get().subtotal() - get().discount(),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: "kutty:cart" },
  ),
);
