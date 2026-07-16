"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { inr } from "@/lib/format";

const BASE_PDF = 799;
const BASE_PRINT = 1299;

export function PricingTier() {
  return (
    <section id="pricing" className="w-full">
      <div className="container-x py-16">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold text-slate-deep md:text-4xl">
            Choose Your Book Format
          </h2>
          <p className="text-slate-mutedText">
            Every format features 28 beautifully customized illustrations with a
            free preview.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          {/* PDF */}
          <div className="relative flex flex-col justify-between rounded-3xl border-2 border-slate-100 bg-white p-8 shadow-sm">
            <div>
              <h3 className="mb-2 text-xl font-bold text-slate-deep">
                PDF Download
              </h3>
              <p className="mb-6 text-sm text-slate-400">
                Get your personalized storybook as a beautiful high-quality PDF.
                Download instantly and print anywhere.
              </p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-gradient-brand">
                  {inr(BASE_PDF)}
                </span>
                <span className="ml-1 text-sm text-slate-400">/ per book</span>
              </div>
              <ul className="mb-8 space-y-3">
                {[
                  "28 illustrated pages",
                  "High-resolution PDF",
                  "Print-ready quality",
                  "Instant download",
                  "Share digitally",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-sm text-slate-600"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/stories" className="btn-outline w-full">
              Start Creating PDF
            </Link>
          </div>

          {/* Print */}
          <div className="relative flex flex-col justify-between rounded-3xl border-2 border-brand-primary bg-white p-8 shadow-md">
            <div className="absolute -top-3.5 right-6 rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              Most Popular
            </div>
            <div>
              <h3 className="mb-2 text-xl font-bold text-slate-deep">
                Printed Book
              </h3>
              <p className="mb-6 text-sm text-slate-400">
                Premium printed book delivered to your doorstep across India in
                5-7 business days.
              </p>
              <div className="mb-6">
                <span className="text-4xl font-extrabold text-gradient-brand">
                  {inr(BASE_PRINT)}
                </span>
                <span className="ml-1 text-sm text-slate-400">/ per book</span>
              </div>
              <ul className="mb-8 space-y-3">
                {[
                  "28 illustrated pages",
                  "210mm × 210mm square format",
                  "170gsm art paper",
                  "Matte laminated cover",
                  "Free shipping across India",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-sm text-slate-600"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/stories" className="btn-primary w-full">
              Start Printing Order
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
