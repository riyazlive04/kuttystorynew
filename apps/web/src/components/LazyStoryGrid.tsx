"use client";

import { useEffect, useRef, useState } from "react";
import { StoryCard } from "@/components/StoryCard";
import type { Story } from "@/lib/types";

/** Cards rendered before the visitor has scrolled, and how many arrive per step.
 *  One full row on every breakpoint (3 up on desktop, 2 up on tablet). */
const FIRST_BATCH = 6;
const STEP = 6;

/**
 * The whole catalogue on the homepage, grown a batch at a time as the visitor
 * scrolls into it.
 *
 * The catalogue is already in the page as a prop -- no request is made to grow
 * the grid, so a step costs nothing but the cover images, and those are lazy by
 * default (`next/image` without `priority`). That is the load worth deferring:
 * a card is a few hundred bytes of markup and its cover is a few hundred KB.
 *
 * Everything past the first batch is reachable without JavaScript through the
 * "Browse all" link beside the heading, which goes to the fully server-rendered
 * /stories library.
 */
export function LazyStoryGrid({ stories }: { stories: Story[] }) {
  const [count, setCount] = useState(FIRST_BATCH);
  const sentinel = useRef<HTMLDivElement>(null);
  const done = count >= stories.length;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    // rootMargin: start the next batch before the visitor reaches the end, so
    // the covers have a head start on decoding and the grid does not visibly
    // stall at the fold.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setCount((c) => Math.min(c + STEP, stories.length));
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, stories.length]);

  return (
    <>
      <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stories.slice(0, count).map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>

      {!done && (
        <div ref={sentinel} className="pt-8 text-center">
          {/* A real button, not a bare sentinel: an observer that never fires --
              no JS, an old browser, a visitor who jumps the page with Find --
              would otherwise leave the rest of the catalogue unreachable here. */}
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(c + STEP, stories.length))}
            className="rounded-xl border-2 border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary"
          >
            Show more stories
          </button>
        </div>
      )}
    </>
  );
}
