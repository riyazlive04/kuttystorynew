"use client";

import { BookOpen, FileDown, Gift } from "lucide-react";
import { inr } from "@/lib/format";
import { FORMATS, FORMAT_LABELS, PRICES, type Format } from "@/lib/pricing";

const ICONS: Record<Format, typeof BookOpen> = {
  pdf: FileDown,
  staple: BookOpen,
  print: Gift,
};

/**
 * Switch a line between the three editions. Shown wherever an order can still
 * be changed — the cart and the checkout summary — because the choice was
 * previously locked in at the paywall with no way back.
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
      className="mt-2 inline-flex flex-wrap overflow-hidden rounded-xl border-2 border-brand-borderAccent"
    >
      {FORMATS.map((v) => {
        const Icon = ICONS[v];
        return (
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
            {FORMAT_LABELS[v]}
            {!compact && (
              <span className={value === v ? "opacity-90" : "text-slate-400"}>
                {inr(PRICES[v])}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
