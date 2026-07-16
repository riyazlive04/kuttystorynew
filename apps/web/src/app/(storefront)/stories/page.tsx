"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { StoryCard } from "@/components/StoryCard";
import { CATEGORIES } from "@/lib/data";
import { listStories } from "@/lib/api";
import type { Story } from "@/lib/types";

export default function StoriesPage() {
  const [active, setActive] = useState<string>("ALL");
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Backend is the source of truth (only active books). Falls back to bundled
    // sample data when no API is configured.
    listStories()
      .then(setStories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    active === "ALL"
      ? stories
      : stories.filter((s) => s.categoryTag === active);

  return (
    <div className="container-x py-12 md:py-16">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          The Story Library
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-mutedText">
          Every book is fully personalized with your child&apos;s name, face and
          language. Pick one to begin - the preview is always free.
        </p>
      </header>

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

      {loading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
        </div>
      ) : (
        <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <StoryCard key={s.id} story={s} />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="py-16 text-center text-slate-mutedText">
          No stories in this category yet - check back soon!
        </p>
      )}
    </div>
  );
}
