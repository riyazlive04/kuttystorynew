import Link from "next/link";
import { Sparkles, Star, Truck, Wand2 } from "lucide-react";

import { HeroSlideshow } from "@/components/HeroSlideshow";
import { heroSamples } from "@/lib/samples";
import type { Story } from "@/lib/types";

/**
 * `stories` is the live catalogue — the hero frame shows pages from the books
 * that are actually on sale, so an unpublished book disappears from here too.
 */
export function Hero({ stories }: { stories: Story[] }) {
  const slides = heroSamples(stories);

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-brand-pink/25 blur-3xl" />

      <div className="container-x grid items-center gap-12 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="chip bg-brand-borderAccent text-brand-primaryDark">
            <Sparkles className="h-3.5 w-3.5" /> 12,000+ happy little readers
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-slate-deep md:text-6xl">
            Make your child the{" "}
            <span className="text-brand-primary">hero</span> of their own
            storybook.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-slate-mutedText">
            Upload a photo, pick a name, choose a story - and watch a beautiful
            28-page book come to life, personalized just for them. In English or
            Tamil, as an instant PDF or a premium printed hardcover.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/stories" className="btn-primary text-base">
              <Wand2 className="h-5 w-5" />
              Start Personalizing - Free Preview
            </Link>
            <Link href="/how-it-works" className="btn-outline text-base">
              How It Works
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-slate-mutedText">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> 4.9/5
              from 2,300+ reviews
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-emerald-500" /> Free delivery across
              India
            </span>
          </div>
        </div>

        {/* Nothing to show if no book is live — the badge is pinned to the
            frame inside HeroSlideshow, so it goes with it rather than floating
            on empty space. */}
        {slides.length > 0 && <HeroSlideshow slides={slides} />}
      </div>
    </section>
  );
}
