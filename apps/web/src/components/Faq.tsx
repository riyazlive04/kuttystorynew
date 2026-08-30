"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQS, type Faq as FaqItem } from "@/lib/faqs";

export function Faq({
  items = FAQS,
  title = "Frequently asked questions",
  intro,
}: {
  items?: FaqItem[];
  title?: string;
  intro?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="container-x py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-3 text-center text-3xl font-bold text-slate-deep md:text-4xl">
          {title}
        </h2>
        {intro && (
          <p className="mb-8 text-center text-slate-mutedText">{intro}</p>
        )}
        <div className={`space-y-3 ${intro ? "" : "mt-8"}`}>
          {items.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <h3 className="font-bold text-slate-deep">{f.q}</h3>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-brand-primary transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {/* Collapsed with CSS rather than unmounted, so every answer is
                    in the crawled HTML and matches the FAQPage markup. Answer
                    engines read the DOM, not the open state. */}
                <div
                  className={`grid transition-all duration-300 ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm leading-relaxed text-slate-mutedText">
                      {f.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
