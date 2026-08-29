"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import type { Sample } from "@/lib/samples";

const INTERVAL_MS = 3500;

/**
 * GIF-like crossfade of real personalized pages for the hero frame. The slides
 * come from whichever books are live (see lib/samples), so this component never
 * decides what to show. Static for visitors who ask for reduced motion — an
 * auto-playing loop is exactly what that setting is meant to stop.
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

  return (
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
  );
}
