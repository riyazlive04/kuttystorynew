"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { inr, languageLabel } from "@/lib/format";
import { FormatSwitch } from "@/components/FormatSwitch";
import { PromoField } from "@/components/PromoField";
import { webImage } from "@/lib/img";

export default function CartPage() {
  const [mounted, setMounted] = useState(false);
  const items = useCart((s) => s.items);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const setFormat = useCart((s) => s.setFormat);
  const subtotal = useCart((s) => s.subtotal());
  const discount = useCart((s) => s.discount());
  const revalidatePromo = useCart((s) => s.revalidatePromo);

  useEffect(() => setMounted(true), []);
  // A persisted code is re-priced against the basket that is actually here, so
  // a restored session can never show "applied" over a total that disagrees.
  useEffect(() => {
    if (mounted) revalidatePromo();
  }, [mounted, revalidatePromo]);
  if (!mounted) return <div className="container-x py-24" />;

  const shipping = 0;
  const total = subtotal - discount + shipping;

  if (items.length === 0) {
    return (
      <div className="container-x py-24 text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-brand-primary/10 text-brand-primary">
          <ShoppingBag className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-bold text-slate-deep">
          Your cart is empty
        </h1>
        <p className="mt-2 text-slate-mutedText">
          Personalize a story to add your first magical book.
        </p>
        <Link href="/stories" className="btn-primary mt-6 inline-flex">
          Browse the library
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-12">
      <h1 className="mb-8 text-3xl font-bold text-slate-deep">Your Cart</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="card flex gap-4 p-4">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={webImage(item.coverImage, 320)}
                  alt={item.storyTitle}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-deep">
                      {item.storyTitle}
                    </h3>
                    <p className="text-sm text-slate-mutedText">
                      For {item.childName} · {languageLabel(item.language)}
                    </p>
                    <FormatSwitch
                      value={item.format}
                      onChange={(f) => setFormat(item.id, f)}
                    />
                  </div>
                  <button
                    onClick={() => remove(item.id)}
                    className="text-slate-300 transition hover:text-red-500"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center gap-1 rounded-xl border-2 border-slate-100">
                    <button
                      onClick={() => setQty(item.id, item.quantity - 1)}
                      className="grid h-8 w-8 place-items-center text-slate-mutedText"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => setQty(item.id, item.quantity + 1)}
                      className="grid h-8 w-8 place-items-center text-slate-mutedText"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="font-bold text-slate-deep">
                    {inr(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-deep">
              Order summary
            </h2>
            {/* Promo code */}
            <PromoField />

            <dl className="space-y-2.5 text-sm">
              <Row k="Subtotal" v={inr(subtotal)} />
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt className="font-semibold">Discount (STORY20)</dt>
                  <dd className="font-bold">-{inr(discount)}</dd>
                </div>
              )}
              <Row k="Shipping" v={shipping === 0 ? "Free" : inr(shipping)} />
              <div className="my-3 border-t border-slate-100" />
              <div className="flex justify-between text-base font-bold text-slate-deep">
                <dt>Total</dt>
                <dd>{inr(total)}</dd>
              </div>
            </dl>
            <Link href="/checkout" className="btn-primary mt-5 w-full">
              Proceed to checkout
            </Link>
            <Link
              href="/stories"
              className="mt-3 block text-center text-sm font-semibold text-slate-mutedText"
            >
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-slate-mutedText">
      <dt>{k}</dt>
      <dd className="font-semibold text-slate-deep">{v}</dd>
    </div>
  );
}
