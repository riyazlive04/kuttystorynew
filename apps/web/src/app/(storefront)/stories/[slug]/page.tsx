import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Star } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PersonalizeWizard } from "@/components/PersonalizeWizard";
import { StoryGenderProvider } from "@/components/StoryGender";
import { StoryHeroArt } from "@/components/StoryHeroArt";
import ProviderCompare from "@/components/ProviderCompare";
import { KeyFacts, RelatedLinks } from "@/components/Prose";
import { getStories, getStoryBySlug, STORY_REVALIDATE } from "@/lib/stories.server";
import {
  FACTS,
  SITE_URL,
  abs,
  breadcrumbJsonLd,
  socialImage,
  storyJsonLd,
  webPageJsonLd,
} from "@/lib/seo";
import { inr } from "@/lib/format";

export const revalidate = STORY_REVALIDATE;
// Titles added in the CMS after a build still render, on demand.
export const dynamicParams = true;

type Props = { params: { slug: string } };

export async function generateStaticParams() {
  const stories = await getStories();
  return stories.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = await getStoryBySlug(params.slug);
  if (!story) {
    return { title: "Story not found | KuttyStory", robots: { index: false } };
  }

  const url = `${SITE_URL}/stories/${story.slug}`;
  // Bare title — the root layout's template appends "| KuttyStory". The age
  // label rides in the title because "personalised book for 4 year old" is a
  // real query shape, and it is the one qualifier a parent scans a SERP for.
  const title = `${story.title} - Personalised Book, ${story.ageRange}`;
  const description = `${story.tagline} ${story.ageRange}, personalised with your child's name and face on every page${
    story.supportsTamil ? ", in English or Tamil" : ""
  }. Free preview first, then ${inr(story.pdfPrice)} for the instant PDF or ${inr(
    story.printPrice,
  )} for the printed hardcover with free India delivery.`;

  const cover = socialImage(story.coverImage);

  return {
    title,
    description,
    keywords: [
      `${story.title} personalised book`,
      `personalised ${story.categoryTag.toLowerCase()} book for kids`,
      `custom story book ${story.ageRange.toLowerCase()}`,
      "children's book with my child's photo",
    ],
    alternates: { canonical: `/stories/${story.slug}` },
    openGraph: {
      title: `${story.title} - a storybook starring your child`,
      description,
      url,
      siteName: "KuttyStory",
      locale: "en_IN",
      type: "article",
      // Omitted for SVG covers so the generated PNG card is used instead.
      ...(cover ? { images: [{ url: cover, alt: story.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${story.title} | KuttyStory`,
      description: story.tagline,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function StoryDetailPage({ params }: Props) {
  const story = await getStoryBySlug(params.slug);
  if (!story) notFound();

  // Three other live titles, linked by name. A catalogue this small leaks most
  // of its internal link equity into the nav; sibling links put it back into
  // the product pages that actually need to rank.
  const siblings = (await getStories())
    .filter((s) => s.slug !== story.slug)
    .slice(0, 3);

  return (
    <div className="container-x py-8 md:py-12">
      <JsonLd
        data={[
          storyJsonLd(story),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Story Library", path: "/stories" },
            { name: story.title, path: `/stories/${story.slug}` },
          ]),
          webPageJsonLd({
            path: `/stories/${story.slug}`,
            name: `${story.title} - personalised storybook`,
            description: story.description,
            type: "ItemPage",
          }),
        ]}
      />

      <Link
        href="/stories"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-mutedText transition hover:text-slate-deep"
      >
        <ArrowLeft className="h-4 w-4" /> Back to library
      </Link>

      {/* The cover and the wizard's Boy/Girl picker share one choice, so a
          both-gender book shows the artwork the child will actually get. */}
      <StoryGenderProvider story={story}>
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Left: story presentation */}
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-4xl border-4 border-white shadow-xl">
              <StoryHeroArt story={story} />
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
                    alt={`${story.title} inside page preview ${i + 1}`}
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
      </StoryGenderProvider>

      {/* Try-before-you-buy: one page from this book, rendered from a photo the
          visitor uploads. Anonymous callers are rate limited by the API. */}
      <div className="mt-12">
        <ProviderCompare slug={story.slug} />
      </div>

      {/* Per-title specifics as a table: unique text on every product page, and
          the shape an answer engine can lift when someone asks what a given
          book costs or how long it takes to arrive. */}
      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-5 text-2xl font-bold text-slate-deep md:text-3xl">
          What you get with {story.title}
        </h2>
        <KeyFacts
          caption={`${story.title} - personalised storybook details`}
          rows={[
            ["Recommended age", story.ageRange],
            ["Theme", story.categoryTag.toLowerCase()],
            ["Pages", `${story.pages} illustrated pages, plus a dedication page you write`],
            ["Personalised with", "Your child's first name, face and character look, on every page"],
            ["Language", story.supportsTamil ? "English or Tamil" : "English"],
            ["Free preview", `Front cover and the first ${FACTS.freePreviewPages} pages, before payment`],
            ["Instant PDF", `${inr(story.pdfPrice)}, downloadable minutes after payment`],
            ["Printed hardcover", `${inr(story.printPrice)}, free delivery across India`],
            [
              "Made and delivered in",
              `${FACTS.productionDaysMin}-${FACTS.productionDaysMax} days to produce, then 2-7 days in transit`,
            ],
            ["Two or more books", "20% off with the code STORY20"],
          ]}
        />
      </section>

      {siblings.length > 0 && (
        <RelatedLinks
          title="Other personalised story books"
          links={[
            ...siblings.map((s) => ({
              label: s.title,
              href: `/stories/${s.slug}`,
              note: `${s.ageRange} · ${s.tagline}`,
            })),
            {
              label: "Browse the whole library",
              href: "/stories",
              note: "Every title, filterable by age and theme",
            },
          ]}
        />
      )}
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
