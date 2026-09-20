import type { Metadata } from "next";
import { PRICES } from "@/lib/pricing";
import Link from "next/link";
import { Hero } from "@/components/Hero";
import { LazyStoryGrid } from "@/components/LazyStoryGrid";
import { PricingTier } from "@/components/PricingTier";
import { Steps, Reviews } from "@/components/Marketing";
import { Faq } from "@/components/Faq";
import { TrustBar } from "@/components/TrustBar";
import { HomeSeoContent } from "@/components/HomeSeoContent";
import { RelatedLinks } from "@/components/Prose";
import { JsonLd } from "@/components/JsonLd";
import { FAQS } from "@/lib/faqs";
import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  FACTS,
  faqJsonLd,
  howToJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from "@/lib/seo";
import { HOW_TO_STEPS } from "@/lib/howto";
import { ArrowRight } from "lucide-react";

export const revalidate = STORY_REVALIDATE;

export const metadata: Metadata = {
  // `absolute` so the home page keeps the full brand-suffixed title from the
  // root layout instead of running it through the template a second time.
  title: { absolute: `${DEFAULT_TITLE} | KuttyStory` },
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Fetched on the server so the "Popular stories" grid is in the HTML a
  // crawler receives, not painted in afterwards by an effect. Only published
  // books come back, and the hero art is built from the same list — so a book
  // taken down stops appearing anywhere on this page.
  const stories = await getStories();

  // Prices quoted in the body copy and the schema come from the live catalogue
  // rather than a hardcoded number, so a repriced title can never leave a stale
  // figure sitting in an indexed page or an AI answer.
  const fromPdf = stories.length
    ? PRICES.pdf
    : FACTS.fromPdfPrice;
  const fromPrint = stories.length
    ? PRICES.print
    : FACTS.fromPrintPrice;

  return (
    <>
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(),
          webPageJsonLd({
            path: "/",
            name: `${DEFAULT_TITLE} | KuttyStory`,
            description: DEFAULT_DESCRIPTION,
          }),
          howToJsonLd(HOW_TO_STEPS),
          // The homepage now carries the whole catalogue, so the ItemList
          // names every title rather than the six that used to be featured.
          itemListJsonLd(
            "Personalized storybooks",
            stories.map((s) => ({
              name: s.title,
              path: `/stories/${s.slug}`,
            })),
          ),
          faqJsonLd(FAQS),
        ]}
      />

      <Hero stories={stories} />

      <TrustBar />

      <section className="container-x py-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-deep md:text-4xl">
              Every personalised story book
            </h2>
            <p className="mt-2 text-slate-mutedText">
              The whole library - your child stars in every one, by name and by
              face.
            </p>
          </div>
          <Link
            href="/stories"
            className="hidden items-center gap-1.5 font-semibold text-brand-primary md:inline-flex"
          >
            Browse all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <LazyStoryGrid stories={stories} />
      </section>

      <Steps />

      <PricingTier />
      <Reviews />

      <HomeSeoContent fromPdf={fromPdf} fromPrint={fromPrint} />

      <Faq />

      <RelatedLinks
        title="More about KuttyStory"
        links={[
          {
            label: "How it works",
            href: "/how-it-works",
            note: "From photo to finished book, step by step",
          },
          {
            label: "Birthday return gifts",
            href: "/birthday-return-gifts",
            note: "Gifting a personalised book to a whole party",
          },
          {
            label: "Guides for parents",
            href: "/guides",
            note: "Choosing, photographing and gifting picture books",
          },
          {
            label: "About KuttyStory",
            href: "/about",
            note: "Who makes these books, and how",
          },
        ]}
      />

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
