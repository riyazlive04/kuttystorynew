import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Star } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { PersonalizeWizard } from "@/components/PersonalizeWizard";
import { StoryCover, StoryGenderProvider } from "@/components/StoryGender";
import ProviderCompare from "@/components/ProviderCompare";
import { getStories, getStoryBySlug, STORY_REVALIDATE } from "@/lib/stories.server";
import {
  SITE_URL,
  abs,
  breadcrumbJsonLd,
  socialImage,
  storyJsonLd,
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
  const title = `${story.title} - Personalized Storybook | KuttyStory`;
  const description = `${story.tagline} ${story.ageRange}. Personalized with your child's name and face${
    story.supportsTamil ? ", in English or Tamil" : ""
  }. Free preview, then ${inr(story.pdfPrice)} PDF or ${inr(
    story.printPrice,
  )} printed hardcover.`;

  const cover = socialImage(story.coverImage);

  return {
    title,
    description,
    alternates: { canonical: `/stories/${story.slug}` },
    openGraph: {
      title: `${story.title} - a storybook starring your child`,
      description: story.tagline,
      url,
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
              <StoryCover story={story} />
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
