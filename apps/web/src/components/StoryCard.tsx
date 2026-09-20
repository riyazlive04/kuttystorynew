"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, Sparkles, Star } from "lucide-react";
import type { Story } from "@/lib/types";
import { faceDemoFor } from "@/lib/faceDemo";
import { FaceSwapDemo } from "@/components/FaceSwapDemo";
import { PRICES } from "@/lib/pricing";
import { inr } from "@/lib/format";
import { webImage } from "@/lib/img";

const CATEGORY_STYLES: Record<string, string> = {
  LEARNING: "bg-amber-500/90",
  ADVENTURE: "bg-indigo-500/90",
  IMAGINATION: "bg-emerald-500/90",
  BEDTIME: "bg-violet-500/90",
};

const AGE_STYLES: Record<
  string,
  { badge: string; icon: string }
> = {
  "Ages 1-5": {
    badge: "bg-rose-50 text-rose-700 border-rose-200/80",
    icon: "text-rose-500",
  },
  "Ages 2-5": {
    badge: "bg-amber-50 text-amber-800 border-amber-200/80",
    icon: "text-amber-500",
  },
  "Ages 2-6": {
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    icon: "text-emerald-500",
  },
  "Ages 3-7": {
    badge: "bg-sky-50 text-sky-800 border-sky-200/80",
    icon: "text-sky-500",
  },
  "Ages 4-8": {
    badge: "bg-violet-50 text-violet-800 border-violet-200/80",
    icon: "text-violet-500",
  },
};

const DEFAULT_AGE_STYLE = {
  badge: "bg-brand-lilac/80 text-brand-primaryDark border-brand-borderAccent",
  icon: "text-brand-primary",
};

export function StoryCard({
  story,
  index = 0,
}: {
  story: Story;
  /** Position in the grid, so neighbouring cards do not animate in unison. */
  index?: number;
}) {
  const router = useRouter();
  const onPersonalize = () => router.push(`/stories/${story.slug}`);
  // The card shows the book's primary illustrated variant -- the same one
  // `coverImage` is -- so a gender-locked book gets its own art and everything
  // else gets the boy plate the catalogue leads with.
  const demo = faceDemoFor(story.slug, story.genderLock ?? "boy");

  return (
    // w-full matters: without it the card shrink-wraps its content, so a long
    // title widens the card, and the square cover grows with it — which is why
    // one story's artwork sat lower than the rest of the row.
    <div className="flex h-full w-full max-w-sm transform flex-col overflow-hidden rounded-3xl border-2 border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <button
        onClick={onPersonalize}
        className="group/book relative w-full bg-gradient-to-b from-slate-50 to-white px-5 pb-6 pt-6 text-left"
      >
        <div className="relative aspect-square w-full">
          {/* The admin's cover artwork, flat and unretouched — no spine band,
              fore edge or lighting on top of it. The only styling is the frame
              around it: rounded corners, a hairline edge and a drop shadow. */}
          <div className="relative h-full w-full overflow-hidden rounded-xl shadow-[0_10px_24px_-8px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/10 transition-transform duration-300 group-hover/book:-translate-y-0.5">
            {demo ? (
              <FaceSwapDemo
                demo={demo}
                title={story.title}
                compact
                stagger={index}
              />
            ) : (
              <Image
                src={webImage(story.coverImage, 800)}
                alt={story.title}
                fill
                sizes="(max-width: 768px) 100vw, 384px"
                className="object-cover"
              />
            )}

            <span
              className={`chip absolute left-3 top-4 z-10 text-white backdrop-blur-sm ${
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

      <div className="flex flex-1 flex-col px-6 pb-6 pt-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-sm font-black tracking-wide shadow-sm transition-all ${
              (AGE_STYLES[story.ageRange] || DEFAULT_AGE_STYLE).badge
            }`}
          >
            <Sparkles
              className={`h-4 w-4 shrink-0 ${
                (AGE_STYLES[story.ageRange] || DEFAULT_AGE_STYLE).icon
              }`}
            />
            <span className="font-kidsHeader text-sm font-bold tracking-normal">
              {story.ageRange.replace("-", "–")}
            </span>
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50/90 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200/60 shadow-xs">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span>4.9</span>
          </span>
        </div>

        <h3 className="mb-1 text-xl font-bold tracking-tight text-slate-deep">
          {story.title}
        </h3>
        <p className="mb-4 line-clamp-2 text-sm text-slate-mutedText">
          {story.tagline}
        </p>

        <div className="mb-6 mt-auto flex items-center gap-3 border-t border-slate-50 pt-4 text-sm">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tight text-slate-400">
              PDF
            </span>
            <span className="text-base font-bold text-slate-700">
              {inr(PRICES.pdf)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tight text-slate-400">
              Staple
            </span>
            <span className="text-base font-bold text-slate-700">
              {inr(PRICES.staple)}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-tight text-slate-400">
              Hardbound
            </span>
            <span className="text-base font-bold text-slate-900">
              {inr(PRICES.print)}
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
