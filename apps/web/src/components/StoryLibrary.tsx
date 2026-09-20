"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/pixel";
import { StoryCard } from "@/components/StoryCard";
import { CATEGORIES } from "@/lib/data";
import type { Story } from "@/lib/types";
import { Sparkles, RotateCcw } from "lucide-react";

const AGE_CATEGORIES = [
  { key: "ALL", label: "All Ages" },
  { key: "1-3", label: "Ages 1–3", sub: "Toddler" },
  { key: "4-5", label: "Ages 4–5", sub: "Preschool" },
  { key: "6-8", label: "Ages 6–8", sub: "Early Reader" },
] as const;

function matchesAge(storyAge: string, filterKey: string): boolean {
  if (filterKey === "ALL") return true;
  const match = storyAge.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return true;
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);

  if (filterKey === "1-3") return min <= 3 && max >= 1;
  if (filterKey === "4-5") return min <= 5 && max >= 4;
  if (filterKey === "6-8") return min <= 8 && max >= 6;
  return true;
}

/**
 * Category & age filtering for the library. The full catalogue arrives as a prop from
 * the server component, so the unfiltered grid is present in the server-rendered
 * HTML and the filter is pure client-side state on top of it.
 */
export function StoryLibrary({ stories }: { stories: Story[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeAge, setActiveAge] = useState<string>("ALL");

  const filtered = stories.filter((s) => {
    const matchCategory =
      activeCategory === "ALL" || s.categoryTag === activeCategory;
    const matchAge = matchesAge(s.ageRange, activeAge);
    return matchCategory && matchAge;
  });

  const hasActiveFilters = activeCategory !== "ALL" || activeAge !== "ALL";

  // Which age and theme a visitor filters to is the strongest intent signal the
  // catalogue page produces, and it is what audiences get built from ("parents
  // of 4-5 year olds who looked at bedtime books").
  useEffect(() => {
    if (!hasActiveFilters) return;
    track("Search", {
      search_string: `age:${activeAge} category:${activeCategory}`,
      content_category: activeCategory,
      content_ids: filtered.slice(0, 10).map((s) => s.slug),
    });
  }, [activeAge, activeCategory]);

  return (
    <>
      <div className="mb-10 space-y-4">
        {/* Age Category Filter */}
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
            <span>Filter by Age Category</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {AGE_CATEGORIES.map((a) => {
              const isSelected = activeAge === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => setActiveAge(a.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border-2 px-4 py-1.5 text-xs font-bold transition-all ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary text-white shadow-sm scale-105"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-primary/60 hover:text-brand-primary"
                  }`}
                >
                  <span>{a.label}</span>
                  {"sub" in a && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.sub}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Theme Category Filter */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Filter by Theme
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setActiveCategory(c.key)}
                className={`rounded-full border-2 px-4 py-1.5 text-xs font-bold transition ${
                  activeCategory === c.key
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-mutedText hover:border-slate-400"
                }`}
              >
                {c.label}
              </button>
            ))}

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setActiveCategory("ALL");
                  setActiveAge("ALL");
                }}
                className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-rose-200 bg-rose-50/50 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s, i) => (
          <StoryCard key={s.id} story={s} index={i} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-slate-mutedText">
            No stories match both selected filters.
          </p>
          <button
            onClick={() => {
              setActiveCategory("ALL");
              setActiveAge("ALL");
            }}
            className="btn-outline mt-4 inline-flex text-xs py-2 px-4"
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
