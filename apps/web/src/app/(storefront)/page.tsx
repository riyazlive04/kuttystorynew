"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { StoryCard } from "@/components/StoryCard";
import { PricingTier } from "@/components/PricingTier";
import { Steps, Reviews } from "@/components/Marketing";
import { Faq } from "@/components/Faq";
import { TrustBar } from "@/components/TrustBar";
import { listStories } from "@/lib/api";
import type { Story } from "@/lib/types";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  const [featured, setFeatured] = useState<Story[]>([]);
  useEffect(() => {
    listStories()
      .then((s) => setFeatured(s.slice(0, 6)))
      .catch(() => {});
  }, []);
  return (
    <>
      <Hero />

      <TrustBar />

      <Steps />

      <section className="container-x py-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-deep md:text-4xl">
              Popular stories
            </h2>
            <p className="mt-2 text-slate-mutedText">
              Pick a tale - your child stars in every one.
            </p>
          </div>
          <Link
            href="/stories"
            className="hidden items-center gap-1.5 font-semibold text-brand-primary md:inline-flex"
          >
            Browse all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((s) => (
            <StoryCard key={s.id} story={s} />
          ))}
        </div>
      </section>

      <PricingTier />
      <Reviews />
      <Faq />

      <section className="container-x pb-20">
        <div className="overflow-hidden rounded-4xl bg-slate-deep px-8 py-14 text-center text-white md:px-16">
          <h2 className="kids text-3xl font-bold md:text-4xl">
            Ready to make their day?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Create a free preview now - no signup, no payment. Just a little
            magic for your little one.
          </p>
          <Link
            href="/stories"
            className="btn-primary mt-8 inline-flex text-base"
          >
            Start Personalizing <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  );
}
