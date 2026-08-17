"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { Story } from "@/lib/types";
import { inr } from "@/lib/format";

const CATEGORY_STYLES: Record<string, string> = {
  LEARNING: "bg-amber-500/90",
  ADVENTURE: "bg-indigo-500/90",
  IMAGINATION: "bg-emerald-500/90",
  BEDTIME: "bg-violet-500/90",
};

export function StoryCard({ story }: { story: Story }) {
  const router = useRouter();
  const onPersonalize = () => router.push(`/stories/${story.slug}`);

  return (
    // w-full matters: without it the card shrink-wraps its content, so a long
    // title widens the card, and the square cover grows with it — which is why
    // one story's artwork sat lower than the rest of the row.
    <div className="flex h-full w-full max-w-sm transform flex-col overflow-hidden rounded-3xl border-2 border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* The flat cover is presented as a hardcover: a shaded spine down the
          left, a page block on the right and a ground shadow underneath. Pure
          CSS over the existing artwork — nothing new to author. */}
      <button
        onClick={onPersonalize}
        className="group/book relative w-full bg-gradient-to-b from-slate-50 to-white px-5 pb-6 pt-6 text-left"
      >
        <div className="relative aspect-square w-full">
          <div className="relative h-full w-full overflow-hidden rounded-l-[3px] rounded-r-xl shadow-[0_10px_24px_-8px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/10 transition-transform duration-300 group-hover/book:-translate-y-0.5">
            <Image
              src={story.coverImage}
              alt={story.title}
              fill
              sizes="(max-width: 768px) 100vw, 384px"
              className="object-cover"
            />

            {/* Spine: the hinge shadow, then the crease highlight beside it. */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[8%] bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 left-[8%] w-px bg-white/25" />

            {/* Page block along the fore edge. */}
            <div className="pointer-events-none absolute inset-y-[1.5%] right-0 w-[1.8%] rounded-r-md bg-gradient-to-l from-white via-slate-200 to-slate-400/60" />

            {/* Light falling across the board. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/12 via-transparent to-slate-950/12" />

            <span
              className={`chip absolute left-[12%] top-4 z-10 text-white backdrop-blur-sm ${
                CATEGORY_STYLES[story.categoryTag] || "bg-slate-900/80"
              }`}
            >
              {story.categoryTag}
            </span>
          </div>

          {/* Ground shadow — sits under the book, not on it. */}
          <div className="pointer-events-none absolute -bottom-2 left-[6%] right-[4%] h-3 rounded-[50%] bg-slate-900/25 blur-md" />
        </div>
      </button>

      <div className="flex flex-1 flex-col px-6 pb-6 pt-2">
        <span className="mb-1 text-sm font-semibold text-slate-400">
          {story.ageRange}
        </span>
        <h3 className="mb-1 text-xl font-bold tracking-tight text-slate-deep">
          {story.title}
        </h3>
        <p className="mb-4 line-clamp-2 text-sm text-slate-mutedText">
          {story.tagline}
        </p>

        <div className="mb-6 mt-auto flex items-center gap-3 border-t border-slate-50 pt-4 text-sm">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tight text-slate-400">
              PDF Copy
            </span>
            <span className="text-base font-bold text-slate-700">
              {inr(story.pdfPrice)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tight text-slate-400">
              Premium Print
            </span>
            <span className="text-base font-bold text-slate-900">
              {inr(story.printPrice)}
            </span>
          </div>
        </div>

        <button onClick={onPersonalize} className="btn-primary w-full">
          <BookOpen className="h-5 w-5" />
          Personalize Story
        </button>
      </div>
    </div>
  );
}
