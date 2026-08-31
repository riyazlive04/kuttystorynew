"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { Story } from "@/lib/types";
import { faceDemoFor } from "@/lib/faceDemo";
import { FaceSwapDemo } from "@/components/FaceSwapDemo";
import { inr } from "@/lib/format";
import { webImage } from "@/lib/img";

const CATEGORY_STYLES: Record<string, string> = {
  LEARNING: "bg-amber-500/90",
  ADVENTURE: "bg-indigo-500/90",
  IMAGINATION: "bg-emerald-500/90",
  BEDTIME: "bg-violet-500/90",
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
