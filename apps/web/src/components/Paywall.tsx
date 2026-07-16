"use client";

import { CheckCircle2, Download, Lock, Package } from "lucide-react";
import { inr } from "@/lib/format";

export const PAYWALL_PDF = 799;
export const PAYWALL_PRINT = 1299;

export function Paywall({
  onSelect,
  paywallPage = 14,
  totalPages = 28,
}: {
  onSelect: (format: "pdf" | "print") => void;
  paywallPage?: number;
  totalPages?: number;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
      {/* Blurred, non-bypassable backdrop over the locked page */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-xl" />

      <div className="relative w-full max-w-lg rounded-3xl border-2 border-brand-borderAccent bg-white p-6 shadow-2xl md:p-8">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white">
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="text-2xl font-bold text-slate-deep">
            You&apos;ve reached page {paywallPage} of {totalPages}
          </h2>
          <p className="mt-1 text-sm text-slate-mutedText">
            Unlock the complete personalized book to keep reading and to download
            or print it.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* PDF */}
          <button
            onClick={() => onSelect("pdf")}
            className="group rounded-2xl border-2 border-slate-100 p-5 text-left transition hover:border-brand-primary"
          >
            <Download className="h-6 w-6 text-brand-primary" />
            <h3 className="mt-3 font-bold text-slate-deep">Digital PDF</h3>
            <p className="text-xs text-slate-mutedText">
              High-res, instant download
            </p>
            <p className="mt-3 text-2xl font-extrabold text-gradient-brand">
              {inr(PAYWALL_PDF)}
            </p>
            <span className="mt-3 inline-block w-full rounded-xl border-2 border-brand-primary py-2 text-center text-sm font-bold text-brand-primary transition group-hover:bg-brand-primary group-hover:text-white">
              Choose PDF
            </span>
          </button>

          {/* Print */}
          <button
            onClick={() => onSelect("print")}
            className="group relative rounded-2xl border-2 border-brand-primary p-5 text-left shadow-glow transition"
          >
            <span className="absolute -top-3 right-4 rounded-full bg-brand-gradient px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
              Most Loved
            </span>
            <Package className="h-6 w-6 text-brand-primary" />
            <h3 className="mt-3 font-bold text-slate-deep">Hardcover Print</h3>
            <p className="text-xs text-slate-mutedText">
              Delivered across India, 5-7 days
            </p>
            <p className="mt-3 text-2xl font-extrabold text-gradient-brand">
              {inr(PAYWALL_PRINT)}
            </p>
            <span className="mt-3 inline-block w-full rounded-xl bg-brand-gradient py-2 text-center text-sm font-bold text-white">
              Choose Print
            </span>
          </button>
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
