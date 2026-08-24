"use client";

import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";

import { useCart } from "@/lib/cart";

/**
 * Promo code entry, shared by the cart and the checkout summary.
 *
 * Codes are priced by the server (POST /promo/validate), so applying one is a
 * round trip rather than a local lookup — hence the pending state on the
 * button. No discount rule lives here, which is what keeps private codes out
 * of the JS bundle.
 */
export function PromoField() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const promoCode = useCart((s) => s.promoCode);
  const applyPromo = useCart((s) => s.applyPromo);
  const removePromo = useCart((s) => s.removePromo);

  async function apply() {
    if (busy || !code.trim()) return;
    setBusy(true);
    const res = await applyPromo(code);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) setCode("");
    setBusy(false);
  }

  if (promoCode) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-brand-mint bg-emerald-50/60 px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700">
          <Tag className="h-4 w-4" /> {promoCode} applied
        </span>
        <button
          onClick={() => {
            removePromo();
            setMsg(null);
          }}
          className="text-emerald-700/70 transition hover:text-emerald-900"
          aria-label="Remove promo code"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Promo code"
          aria-label="Promo code"
          disabled={busy}
          className="w-full rounded-xl border-2 border-brand-borderAccent bg-white px-3 py-2 text-sm uppercase outline-none transition placeholder:normal-case focus:border-brand-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={apply}
          disabled={busy || !code.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-brand-primary"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking…
            </>
          ) : (
            "Apply"
          )}
        </button>
      </div>
      {msg && (
        <p
          role="status"
          className={`mt-1.5 text-xs font-semibold ${
            msg.ok ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
