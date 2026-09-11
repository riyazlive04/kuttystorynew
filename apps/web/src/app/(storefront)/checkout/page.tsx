"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart";
import { inr } from "@/lib/format";
import { createOrder, verifyPayment } from "@/lib/api";
import { INDIAN_STATES, INDIAN_UNION_TERRITORIES } from "@/lib/india";
import { FormatSwitch } from "@/components/FormatSwitch";
import { PromoField } from "@/components/PromoField";
import { payWithRazorpay } from "@/lib/razorpay";
import type { OrderInput } from "@/lib/types";
import { webImage } from "@/lib/img";
import { useCustomerAuth } from "@/lib/auth";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
};

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { customer } = useCustomerAuth();

  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const discount = useCart((s) => s.discount());
  const promoCode = useCart((s) => s.promoCode);
  const clear = useCart((s) => s.clear);
  const setFormat = useCart((s) => s.setFormat);
  const remove = useCart((s) => s.remove);
  const revalidatePromo = useCart((s) => s.revalidatePromo);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (customer?.phone) {
      setForm((f) => (f.phone ? f : { ...f, phone: customer.phone }));
    }
  }, [customer]);
  // Same re-pricing as the cart: arriving here by browser back, a reload or a
  // second tab must not show a code applied to a basket that no longer earns it.
  useEffect(() => {
    if (mounted) revalidatePromo();
  }, [mounted, revalidatePromo]);
  if (!mounted) return <div className="container-x py-24" />;

  const hasPhysical = items.some((i) => i.format === "print");
  const shipping = 0;
  const total = subtotal - discount + shipping;

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const requiredOk =
    form.name &&
    /\S+@\S+\.\S+/.test(form.email) &&
    form.phone.length >= 10 &&
    (!hasPhysical ||
      (form.address1 && form.city && form.state && form.pincode.length >= 6));

  async function handlePay() {
    if (!requiredOk || items.length === 0) return;
    setError(null);
    setPaying(true);
    try {
      // Order FIRST, payment second. The server reprices the cart as it stores
      // the order, and that stored total is what the gateway then charges — so
      // the amount is never the browser's to choose. It also means we can no
      // longer take money for an order that failed to save.
      const input: OrderInput = {
        items,
        customer: form,
        subtotal,
        discount,
        promoCode: promoCode || undefined,
        shipping,
        total,
      };
      const order = await createOrder(input);

      const payment = await payWithRazorpay({
        orderId: order.id,
        name: form.name,
        email: form.email,
        phone: form.phone,
        orderTitle: `KuttyStory · ${items.length} book(s)`,
      });

      // Verify server-side before treating the order as paid: the signature is
      // the only proof the payment is genuine, and it can only be checked with
      // the key secret, which never leaves the backend.
      if (!payment.mock) {
        await verifyPayment({
          orderId: order.id,
          razorpayOrderId: payment.orderId,
          razorpayPaymentId: payment.paymentId,
          razorpaySignature: payment.signature,
        });
      }

      clear();
      router.push(
        `/order/${order.id}?pid=${encodeURIComponent(payment.paymentId)}`,
      );
    } catch (e: any) {
      setError(e?.message || "Payment failed. Please try again.");
      setPaying(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-deep">
          Nothing to check out
        </h1>
        <Link href="/stories" className="btn-primary mt-6 inline-flex">
          Browse stories
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-12">
      <h1 className="mb-8 text-3xl font-bold text-slate-deep">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-deep">
              Contact details
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Full name" value={form.name} onChange={(v) => set("name", v)} />
              <Input label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="10-digit mobile" />
              <div className="sm:col-span-2">
                <Input label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="For your PDF & receipt" />
              </div>
            </div>
          </section>

          {hasPhysical && (
            <section className="card p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-deep">
                Shipping address
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input label="Address line 1" value={form.address1} onChange={(v) => set("address1", v)} />
                </div>
                <div className="sm:col-span-2">
                  <Input label="Address line 2 (optional)" value={form.address2} onChange={(v) => set("address2", v)} />
                </div>
                <Input label="City" value={form.city} onChange={(v) => set("city", v)} />
                <Select
                  label="State"
                  value={form.state}
                  onChange={(v) => set("state", v)}
                />
                <Input label="PIN code" value={form.pincode} onChange={(v) => set("pincode", v)} />
              </div>
            </section>
          )}

          <div className="flex items-center gap-2 text-sm text-slate-mutedText">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Payments are securely processed by Razorpay (UPI, cards, netbanking).
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-deep">
              Order summary
            </h2>
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                    <Image src={webImage(i.coverImage, 320)} alt={i.storyTitle} fill sizes="56px" className="object-cover" />
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-semibold text-slate-deep">{i.storyTitle}</p>
                    <p className="text-xs text-slate-mutedText">
                      {i.childName} · ×{i.quantity}
                    </p>
                    <FormatSwitch
                      value={i.format}
                      onChange={(f) => setFormat(i.id, f)}
                      compact
                    />
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <span className="text-sm font-bold text-slate-deep">
                      {inr(i.unitPrice * i.quantity)}
                    </span>
                    {/* Same affordance as the cart page: a shopper who changes
                        their mind here shouldn't have to navigate back to drop
                        a book. Removing the last one falls through to the
                        "Nothing to check out" state above. */}
                    <button
                      type="button"
                      onClick={() => remove(i.id)}
                      className="mt-1 text-slate-300 transition hover:text-red-500"
                      aria-label={`Remove ${i.storyTitle} for ${i.childName}`}
                      title="Remove from cart"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="my-4 border-t border-slate-100" />
            {/* Same entry point as the cart: a shopper who reaches checkout
                without applying their code shouldn't have to navigate back. */}
            <PromoField />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-mutedText">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-slate-deep">{inr(subtotal)}</dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <dt className="font-semibold">Discount ({promoCode})</dt>
                  <dd className="font-bold">-{inr(discount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-slate-mutedText">
                <dt>Shipping</dt>
                <dd className="font-semibold text-emerald-600">Free</dd>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold text-slate-deep">
                <dt>Total</dt>
                <dd>{inr(total)}</dd>
              </div>
            </dl>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              onClick={handlePay}
              disabled={!requiredOk || paying}
              className="btn-primary mt-5 w-full disabled:opacity-50"
            >
              {paying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5" /> Pay {inr(total)}
                </>
              )}
            </button>
            {!requiredOk && (
              <p className="mt-2 text-center text-xs text-slate-400">
                Fill in your details to continue.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-deep">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-primary"
      >
        <option value="">Select a state…</option>
        <optgroup label="States">
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </optgroup>
        <optgroup label="Union Territories">
          {INDIAN_UNION_TERRITORIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-deep">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-primary"
      />
    </label>
  );
}
