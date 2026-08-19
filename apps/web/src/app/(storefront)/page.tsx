import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { StoryCard } from "@/components/StoryCard";
import { PricingTier } from "@/components/PricingTier";
import { Steps, Reviews } from "@/components/Marketing";
import { Faq } from "@/components/Faq";
import { TrustBar } from "@/components/TrustBar";
import { JsonLd } from "@/components/JsonLd";
import { FAQS } from "@/lib/faqs";
import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import { faqJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { ArrowRight } from "lucide-react";

export const revalidate = STORY_REVALIDATE;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Fetched on the server so the "Popular stories" grid is in the HTML a
  // crawler receives, not painted in afterwards by an effect.
  const featured = (await getStories()).slice(0, 6);

  return (
    <>
      <JsonLd
        data={[organizationJsonLd(), websiteJsonLd(), faqJsonLd(FAQS)]}
      />

      <Hero />

      <TrustBar />

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

      <Steps />

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
