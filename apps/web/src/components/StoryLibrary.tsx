"use client";

import { useState } from "react";
import { StoryCard } from "@/components/StoryCard";
import { CATEGORIES } from "@/lib/data";
import type { Story } from "@/lib/types";

/**
 * Category filtering for the library. The full catalogue arrives as a prop from
 * the server component, so the unfiltered grid is present in the server-rendered
 * HTML and the filter is pure client-side state on top of it.
 */
export function StoryLibrary({ stories }: { stories: Story[] }) {
  const [active, setActive] = useState<string>("ALL");

  const filtered =
    active === "ALL" ? stories : stories.filter((s) => s.categoryTag === active);

  return (
    <>
      <div className="mb-10 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={`rounded-full border-2 px-5 py-2 text-sm font-bold transition ${
              active === c.key
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-slate-200 bg-white text-slate-mutedText hover:border-brand-primary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s, i) => (
          <StoryCard key={s.id} story={s} index={i} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-16 text-center text-slate-mutedText">
          No stories in this category yet - check back soon!
        </p>
      )}
    </>
  );
}
