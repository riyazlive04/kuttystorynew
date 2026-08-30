import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { RelatedLinks } from "@/components/Prose";
import { GUIDES } from "@/lib/guides";
import {
  breadcrumbJsonLd,
  itemListJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

const TITLE = "Guides for Parents: Personalised Books & Gifting";
const DESCRIPTION =
  "Practical guides to personalised children's books - which photo to use, what suits your child's age, and the seven things worth checking before you order one in India.";

export const metadata: Metadata = pageMeta({
  title: TITLE,
  description: DESCRIPTION,
  path: "/guides",
  keywords: [
    "personalised book guides",
    "children's book buying guide India",
    "how to choose a story book for kids",
  ],
});

export default function GuidesIndexPage() {
  return (
    <div>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Guides", path: "/guides" },
          ]),
          webPageJsonLd({
            path: "/guides",
            name: TITLE,
            description: DESCRIPTION,
            type: "CollectionPage",
          }),
          itemListJsonLd(
            "KuttyStory guides for parents",
            GUIDES.map((g) => ({ name: g.title, path: `/guides/${g.slug}` })),
          ),
        ]}
      />

      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          Guides for parents
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-slate-mutedText"
          data-speakable
        >
          Short, practical answers to the things people ask before buying a
          personalised story book - which photo to use, what works at your
          child&apos;s age, and what separates a good one from a name printed on
          a cover.
        </p>
      </section>

      <section className="container-x pb-8">
        <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
          {GUIDES.map((g) => (
            <article key={g.slug} className="card flex flex-col p-7">
              <h2 className="text-lg font-bold text-slate-deep">
                <Link
                  href={`/guides/${g.slug}`}
                  className="transition hover:text-brand-primary"
                >
                  {g.title}
                </Link>
              </h2>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-mutedText">
                {g.description}
              </p>
              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <Clock className="h-4 w-4" /> {g.readingMinutes} min read
                </span>
                <Link
                  href={`/guides/${g.slug}`}
                  className="inline-flex items-center gap-1 font-semibold text-brand-primary"
                >
                  Read <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <RelatedLinks
        title="Ready when you are"
        links={[
          {
            label: "Browse the story library",
            href: "/stories",
            note: "Every title, free to preview",
          },
          {
            label: "How it works",
            href: "/how-it-works",
            note: "Photo to finished book",
          },
          {
            label: "Birthday return gifts",
            href: "/birthday-return-gifts",
            note: "Ordering for a party",
          },
          {
            label: "About KuttyStory",
            href: "/about",
            note: "Who makes these books",
          },
        ]}
      />
    </div>
  );
}
