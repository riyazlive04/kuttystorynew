"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import type { Sample } from "@/lib/samples";

const INTERVAL_MS = 3500;

/**
 * The hero frame: a GIF-like crossfade of real personalized pages, and the
 * "Personalizing for" badge pinned to its corner.
 *
 * The badge lives in here rather than in Hero because it has to name the child
 * in the picture, and only this component knows which slide is showing. It used
 * to be a hardcoded "Aarav, age 4" sitting in the server component, which meant
 * a girl's unicorn book was captioned with a boy's name for three and a half
 * seconds at a time.
 *
 * The slides come from whichever books are live (see lib/samples), so this
 * component never decides what to show. Static for visitors who ask for reduced
 * motion — an auto-playing loop is exactly what that setting is meant to stop,
 * and the badge then simply names the first slide's child.
 */
export function HeroSlideshow({ slides }: { slides: Sample[] }) {
  const [i, setI] = useState(0);
  const n = slides.length;

  useEffect(() => {
    if (n <= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    const t = setInterval(() => setI((v) => (v + 1) % n), INTERVAL_MS);
    return () => clearInterval(t);
  }, [n]);

  if (n === 0) return null;

  const current = slides[i % n];

  return (
    <div className="relative">
      <div className="animate-floaty rounded-4xl border-4 border-white bg-white p-3 shadow-2xl">
        <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-slate-50">
          {slides.map((s, idx) => (
            <Image
              key={s.src}
              src={s.src}
              alt={s.alt}
              fill
              sizes="(max-width: 768px) 100vw, 500px"
              priority={idx === 0}
              className={`object-cover transition-opacity duration-1000 ease-in-out ${
                idx === i % n ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border-2 border-slate-100 bg-white px-4 py-3 shadow-lg sm:block">
        <p className="text-xs font-semibold text-slate-mutedText">
          Personalizing for
        </p>
        {/* Fades on the same beat as the artwork, so the pair reads as one
            change rather than a caption twitching under a still picture. */}
        <p
          key={current.src}
          className="kids animate-fade-in text-lg font-bold text-brand-primary"
        >
          {current.childName}, age {current.childAge} ✨
        </p>
      </div>
    </div>
  );
}
