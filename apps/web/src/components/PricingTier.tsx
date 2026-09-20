"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { inr } from "@/lib/format";
import { FORMAT_EMOJI, FORMAT_LABELS, PRICES, type Format } from "@/lib/pricing";

// The three editions, in the order the paywall offers them. Prices come from
// lib/pricing so the homepage can never quote one number and the checkout
// charge another.
const TIERS: {
  format: Format;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
}[] = [
  {
    format: "pdf",
    blurb:
      "Your personalised storybook as a high-quality PDF. Download it within minutes and print it anywhere.",
    features: [
      "28 illustrated pages",
      "High-resolution PDF",
      "Print-ready quality",
      "Instant download",
      "Share digitally",
    ],
    cta: "Start Creating PDF",
  },
  {
    format: "staple",
    blurb:
      "A softcover printed book with a stapled spine — the same pages, lighter and easier on the budget.",
    features: [
      "28 illustrated pages",
      "210mm × 210mm square format",
      "Softcover, stapled spine",
      "170gsm art paper",
      "Free shipping across India",
    ],
    cta: "Order Staple Bound",
  },
  {
    format: "print",
    blurb:
      "Our premium hardbound keepsake, made to order in 4-7 days and delivered free anywhere in India.",
    features: [
      "28 illustrated pages",
      "210mm × 210mm square format",
      "Hardbound cover",
      "170gsm art paper",
      "Free shipping across India",
    ],
    cta: "Order Hardbound",
    featured: true,
  },
];

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

        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          {TIERS.map(({ format, blurb, features, cta, featured }) => (
            <div
              key={format}
              className={`relative flex flex-col justify-between rounded-3xl border-2 bg-white p-8 ${
                featured
                  ? "border-brand-primary shadow-md"
                  : "border-slate-100 shadow-sm"
              }`}
            >
              {featured && (
                <div className="absolute -top-3.5 right-6 rounded-full bg-brand-gradient px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Most Popular
                </div>
              )}
              <div>
                <h3 className="mb-2 text-xl font-bold text-slate-deep">
                  <span aria-hidden className="mr-1.5">
                    {FORMAT_EMOJI[format]}
                  </span>
                  {FORMAT_LABELS[format]}
                </h3>
                <p className="mb-6 text-sm text-slate-400">{blurb}</p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-gradient-brand">
                    {inr(PRICES[format])}
                  </span>
                  <span className="ml-1 text-sm text-slate-400">/ per book</span>
                </div>
                <ul className="mb-8 space-y-3">
                  {features.map((item) => (
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
              <Link
                href="/stories"
                className={featured ? "btn-primary w-full" : "btn-outline w-full"}
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
