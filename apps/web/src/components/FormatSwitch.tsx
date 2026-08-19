"use client";

import { BookOpen, FileDown } from "lucide-react";
import { inr } from "@/lib/format";
import { PDF_PRICE, PRINT_PRICE } from "@/lib/pricing";

type Format = "pdf" | "print";

const OPTIONS: { value: Format; label: string; price: number; Icon: typeof BookOpen }[] = [
  { value: "pdf", label: "Instant PDF", price: PDF_PRICE, Icon: FileDown },
  { value: "print", label: "Hardcover", price: PRINT_PRICE, Icon: BookOpen },
];

/**
 * Switch a line between the digital and printed edition. Shown wherever an
 * order can still be changed — the cart and the checkout summary — because the
 * choice was previously locked in at the paywall with no way back.
 */
export function FormatSwitch({
  value,
  onChange,
  compact = false,
}: {
  value: Format;
  onChange: (f: Format) => void;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Edition"
      className="mt-2 inline-flex overflow-hidden rounded-xl border-2 border-brand-borderAccent"
    >
      {OPTIONS.map(({ value: v, label, price, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition ${
            value === v
              ? "bg-brand-primary text-white"
              : "bg-white text-slate-mutedText hover:bg-brand-primary/5"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          {!compact && (
            <span className={value === v ? "opacity-90" : "text-slate-400"}>
              {inr(price)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
