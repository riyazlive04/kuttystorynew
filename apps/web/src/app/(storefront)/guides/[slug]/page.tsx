import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { GuideBody } from "@/components/GuideBody";
import { Faq } from "@/components/Faq";
import { Prose, RelatedLinks } from "@/components/Prose";
import { GUIDES, getGuide } from "@/lib/guides";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return { title: "Guide not found", robots: { index: false } };

  return pageMeta({
    title: guide.metaTitle,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    keywords: guide.keywords,
    type: "article",
    publishedTime: guide.published,
    modifiedTime: guide.updated,
  });
}

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function GuidePage({ params }: Props) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();

  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <div className="py-10 md:py-14">
      <JsonLd
        data={[
          articleJsonLd({
            path: `/guides/${guide.slug}`,
            headline: guide.title,
            description: guide.description,
            published: guide.published,
            updated: guide.updated,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: guide.title, path: `/guides/${guide.slug}` },
          ]),
          webPageJsonLd({
            path: `/guides/${guide.slug}`,
            name: guide.title,
            description: guide.description,
          }),
          faqJsonLd(guide.faqs),
        ]}
      />

      <div className="container-x">
        <Link
          href="/guides"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-mutedText transition hover:text-slate-deep"
        >
          <ArrowLeft className="h-4 w-4" /> All guides
        </Link>

        <header className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold leading-tight text-slate-deep md:text-4xl">
            {guide.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {guide.readingMinutes} min read
            </span>
            {/* A visible, machine-readable update date. Freshness is one of the
                signals answer engines weigh when choosing between two pages
                that say the same thing. */}
            <span>
              Updated{" "}
              <time dateTime={guide.updated}>
                {DATE.format(new Date(guide.updated))}
              </time>
            </span>
          </div>
          <p
            className="mt-6 border-l-4 border-brand-primary/40 pl-5 text-lg leading-relaxed text-slate-deep"
            data-speakable
          >
            {guide.intro}
          </p>
        </header>

        <article className="mt-4">
          <Prose className="[&>section]:space-y-4">
            <GuideBody sections={guide.sections} />
          </Prose>
        </article>
      </div>

      <Faq items={guide.faqs} title="Related questions" />

      <RelatedLinks
        title="Next"
        links={[
          ...others.map((g) => ({
            label: g.title,
            href: `/guides/${g.slug}`,
            note: `${g.readingMinutes} min read`,
          })),
          {
            label: "Browse the story library",
            href: "/stories",
            note: "Free to preview, no signup",
          },
        ]}
      />

      <section className="container-x pb-16 text-center">
        <Link href="/stories" className="btn-primary inline-flex text-base">
          Make a book, free to preview <ArrowRight className="h-5 w-5" />
        </Link>
      </section>
    </div>
  );
}
