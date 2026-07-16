"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

/**
 * Auto-playing showcase of real personalized storybook pages. Slides crossfade
 * on a timer (GIF-like), pause on hover, and can be stepped with the arrows/dots.
 *
 * To change the images: drop square page JPGs into `apps/web/public/samples/`
 * and list them here.
 */
const SAMPLES: { src: string; alt: string }[] = [
  { src: "/samples/sample-1.jpg", alt: "A personalized cricket adventure page" },
  { src: "/samples/sample-2.jpg", alt: "A personalized storybook page" },
  { src: "/samples/sample-3.jpg", alt: "A personalized storybook page" },
];

const INTERVAL_MS = 3500;

export function SampleCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SAMPLES.length;

  useEffect(() => {
    if (paused || n <= 1) return;
    const t = setInterval(() => setI((v) => (v + 1) % n), INTERVAL_MS);
    return () => clearInterval(t);
  }, [paused, n]);

  if (n === 0) return null;

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

      <div
        className="mx-auto max-w-xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl border-2 border-brand-borderAccent bg-slate-50 shadow-glow">
          {SAMPLES.map((s, idx) => (
            <Image
              key={s.src}
              src={s.src}
              alt={s.alt}
              fill
              sizes="(max-width: 768px) 100vw, 576px"
              priority={idx === 0}
              className={`object-cover transition-opacity duration-700 ease-in-out ${
                idx === i ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}

          <button
            onClick={() => setI((v) => (v - 1 + n) % n)}
            aria-label="Previous sample"
            className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={() => setI((v) => (v + 1) % n)}
            aria-label="Next sample"
            className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {SAMPLES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Go to sample ${idx + 1}`}
              className={`h-2 rounded-full transition-all ${
                idx === i ? "w-6 bg-brand-primary" : "w-2 bg-brand-borderAccent"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link href="/stories" className="btn-primary inline-flex text-base">
            <Sparkles className="h-5 w-5" /> Make your child the hero
          </Link>
        </div>
      </div>
    </section>
  );
}
