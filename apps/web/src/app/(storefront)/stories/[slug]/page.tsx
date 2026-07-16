"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Star } from "lucide-react";
import { fetchStory } from "@/lib/api";
import type { Story } from "@/lib/types";
import { inr } from "@/lib/format";
import { PersonalizeWizard } from "@/components/PersonalizeWizard";

export default function StoryDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const [story, setStory] = useState<Story | null | undefined>(undefined);

  useEffect(() => {
    // Backend is the source of truth (falls back to bundled sample data).
    fetchStory(params.slug)
      .then((s) => setStory(s ?? null))
      .catch(() => setStory(null));
  }, [params.slug]);

  if (story === undefined) {
    return (
      <div className="container-x grid place-items-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (story === null) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-deep">Story not found</h1>
        <p className="mt-2 text-slate-mutedText">
          This book may have been unpublished.
        </p>
        <Link href="/stories" className="btn-primary mt-6 inline-flex">
          Browse the library
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-8 md:py-12">
      <Link
        href="/stories"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-mutedText transition hover:text-slate-deep"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Left: story presentation */}
        <div>
          <div className="relative aspect-square w-full overflow-hidden rounded-4xl border-4 border-white shadow-xl">
            <Image
              src={story.coverImage}
              alt={story.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 600px"
              className="object-cover"
            />
            <span className="chip absolute left-5 top-5 bg-slate-900/80 text-white backdrop-blur">
              {story.categoryTag}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {story.gallery.map((g, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-2xl border-2 border-slate-100"
              >
                <Image
                  src={g}
                  alt={`${story.title} preview ${i + 1}`}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-400">
                {story.ageRange}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-500">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> 4.9
              </span>
            </div>
            <h1 className="text-3xl font-bold text-slate-deep md:text-4xl">
              {story.title}
            </h1>
            <p className="mt-4 leading-relaxed text-slate-mutedText">
              {story.description}
            </p>

            <ul className="mt-6 space-y-2.5">
              {story.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-center gap-2.5 text-sm text-slate-700"
                >
                  <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                  {h}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex gap-4 rounded-2xl border-2 border-brand-borderAccent bg-brand-cream p-4 text-sm">
              <PriceBadge label="PDF" price={inr(story.pdfPrice)} />
              <div className="w-px bg-amber-200" />
              <PriceBadge label="Premium Print" price={inr(story.printPrice)} />
            </div>
          </div>
        </div>

        {/* Right: wizard */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <PersonalizeWizard story={story} />
        </div>
      </div>
    </div>
  );
}

function PriceBadge({ label, price }: { label: string; price: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-tight text-slate-400">
        {label}
      </span>
      <span className="text-base font-bold text-slate-deep">{price}</span>
    </div>
  );
}
