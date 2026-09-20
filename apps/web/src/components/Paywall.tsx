"use client";

import { BookOpen, CheckCircle2, Download, Gift, Lock } from "lucide-react";
import { inr } from "@/lib/format";

import {
  FORMATS,
  FORMAT_BLURBS,
  FORMAT_LABELS,
  PRICES,
  type Format,
} from "@/lib/pricing";

const ICONS: Record<Format, typeof BookOpen> = {
  pdf: Download,
  staple: BookOpen,
  print: Gift,
};

// The hard cover is the one we recommend, so it carries the badge and the solid
// button; the other two are outlined.
const FEATURED: Format = "print";

export function Paywall({
  onSelect,
  paywallPage = 14,
  totalPages = 28,
}: {
  onSelect: (format: Format) => void;
  paywallPage?: number;
  totalPages?: number;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
      {/* Blurred, non-bypassable backdrop over the locked page */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-xl" />

      <div className="relative w-full max-w-3xl rounded-3xl border-2 border-brand-borderAccent bg-white p-6 shadow-2xl md:p-8">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white">
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="text-2xl font-bold text-slate-deep">
            You&apos;ve reached page {paywallPage} of {totalPages}
          </h2>
          <p className="mt-1 text-sm text-slate-mutedText">
            Choose your preferred format to unlock the complete personalized
            book.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {FORMATS.map((f) => {
            const Icon = ICONS[f];
            const featured = f === FEATURED;
            return (
              <button
                key={f}
                onClick={() => onSelect(f)}
                className={`group relative rounded-2xl border-2 p-5 text-left transition ${
                  featured
                    ? "border-brand-primary shadow-glow"
                    : "border-slate-100 hover:border-brand-primary"
                }`}
              >
                {featured && (
                  <span className="absolute -top-3 right-4 rounded-full bg-brand-gradient px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    Most Loved
                  </span>
                )}
                <Icon className="h-6 w-6 text-brand-primary" />
                <h3 className="mt-3 font-bold text-slate-deep">
                  {FORMAT_LABELS[f]}
                </h3>
                <p className="text-xs text-slate-mutedText">{FORMAT_BLURBS[f]}</p>
                <p className="mt-3 text-2xl font-extrabold text-gradient-brand">
                  {inr(PRICES[f])}
                </p>
                <span
                  className={`mt-3 inline-block w-full rounded-xl py-2 text-center text-sm font-bold transition ${
                    featured
                      ? "bg-brand-gradient text-white"
                      : "border-2 border-brand-primary text-brand-primary group-hover:bg-brand-primary group-hover:text-white"
                  }`}
                >
                  Choose {FORMAT_LABELS[f]}
                </span>
              </button>
            );
          })}
        </div>

        <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-slate-mutedText">
          {[`All ${totalPages} pages`, "Free preview kept", "Secure Razorpay", "100% guarantee"].map(
            (t) => (
              <li key={t} className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {t}
              </li>
            ),
          )}
        </ul>
      </div>
    </div>
  );
}
