"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

import { storySamples, type StorySamples } from "@/lib/samples";
import type { Story } from "@/lib/types";

const INTERVAL_MS = 3500;

/**
 * One story's pages, crossfading on a timer (GIF-like). Pauses on hover and can
 * be stepped with the arrows/dots. Static for visitors who ask for reduced
 * motion — an auto-playing loop is what that setting exists to stop.
 */
function StorySlideshow({ story }: { story: StorySamples }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = story.pages.length;

  useEffect(() => {
    if (paused || n <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % n), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, n]);

  if (n === 0) return null;

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border-2 border-brand-borderAccent bg-slate-50 shadow-glow">
        {story.pages.map((p, idx) => (
          <Image
            key={p.src}
            src={p.src}
            alt={p.alt}
            fill
            sizes="(max-width: 768px) 100vw, 440px"
            priority={idx === 0}
            className={`object-cover transition-opacity duration-700 ease-in-out ${
              idx === i ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {n > 1 && (
          <>
            <button
              onClick={() => setI((v) => (v - 1 + n) % n)}
              aria-label={`Previous page of ${story.title}`}
              className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={() => setI((v) => (v + 1) % n)}
              aria-label={`Next page of ${story.title}`}
              className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-lg font-bold text-slate-deep">
        <Link href={`/stories/${story.slug}`} className="hover:text-brand-primary">
          {story.title}
        </Link>
      </p>

      {n > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {story.pages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Go to page ${idx + 1} of ${story.title}`}
              className={`h-2 rounded-full transition-all ${
                idx === i ? "w-6 bg-brand-primary" : "w-2 bg-brand-borderAccent"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** `stories` is the live catalogue — see Hero. */
export function SampleCarousel({ stories }: { stories: Story[] }) {
  const samples = storySamples(stories);
  if (samples.length === 0) return null;

  return (
    <section className="container-x py-10">
      <div className="mb-8 text-center">
        <span className="chip bg-brand-borderAccent text-brand-primaryDark">
          <Sparkles className="h-3.5 w-3.5" /> Sample pages
        </span>
        <h2 className="mt-3 text-3xl font-bold text-slate-deep md:text-4xl">
          See the magic, page by page
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-mutedText">
          Every page is illustrated around your child — their face, their name,
          their story. Here&apos;s a peek.
        </p>
      </div>

      {/* Stacked on mobile, side by side from md up. justify-center keeps the
          pair centered if a story is ever added or removed. */}
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-8 md:flex-row md:items-start">
        {samples.map((story) => (
          <div key={story.slug} className="w-full max-w-md md:flex-1">
            <StorySlideshow story={story} />
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/stories" className="btn-primary inline-flex text-base">
          <Sparkles className="h-5 w-5" /> Make your child the hero
        </Link>
      </div>
    </section>
  );
}
