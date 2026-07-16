"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How does the personalization work?",
    a: "You give us your child's name, age and a photo. Our illustration studio weaves them into a professionally written story so your child becomes the star of every page.",
  },
  {
    q: "Is the preview really free?",
    a: "Yes! You get an 8-page preview instantly with zero commitment. You only pay when you decide to unlock the full book as a PDF or order a printed copy.",
  },
  {
    q: "Do you support Tamil?",
    a: "Most of our titles are available in English and Tamil. Look for the தமிழ் ✓ badge on a story.",
  },
  {
    q: "How long does printing and delivery take?",
    a: "Printed hardcovers are produced within 2-3 business days and delivered free across India, typically within 4-7 days of your order.",
  },
  {
    q: "What if I'm not happy with my book?",
    a: "Because you approve the full preview before paying, surprises are rare - but if something's wrong with a printed copy, we'll reprint or refund it.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="container-x py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-8 text-center text-3xl font-bold text-slate-deep md:text-4xl">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-bold text-slate-deep">{f.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-brand-primary transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="px-6 pb-5 text-sm leading-relaxed text-slate-mutedText">
                    {f.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
