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
      <button
        onClick={onPersonalize}
        className="relative aspect-square w-full overflow-hidden border-b border-slate-100 bg-slate-50 text-left"
      >
        <Image
          src={story.coverImage}
          alt={story.title}
          fill
          sizes="(max-width: 768px) 100vw, 384px"
          className="object-cover transition duration-500 hover:scale-105"
        />
        <span
          className={`chip absolute left-4 top-4 text-white backdrop-blur-sm ${
            CATEGORY_STYLES[story.categoryTag] || "bg-slate-900/80"
          }`}
        >
          {story.categoryTag}
        </span>
      </button>

      <div className="flex flex-1 flex-col p-6">
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
