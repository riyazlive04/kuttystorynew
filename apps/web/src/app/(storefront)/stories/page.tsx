import type { Metadata } from "next";
import Link from "next/link";
import { StoryLibrary } from "@/components/StoryLibrary";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { KeyFacts, Prose, ProseH2, RelatedLinks } from "@/components/Prose";
import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import { FAQS } from "@/lib/faqs";
import { inr } from "@/lib/format";
import {
  FACTS,
  SITE_URL,
  abs,
  breadcrumbJsonLd,
  faqJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

export const revalidate = STORY_REVALIDATE;

export const metadata: Metadata = pageMeta({
  title: "Browse All Personalised Children's Books",
  description:
    "Every KuttyStory title in one place - learning, adventure, imagination and bedtime books personalised with your child's name and face. Free preview on every story, ages 1-8.",
  path: "/stories",
  keywords: [
    "personalised children's books online",
    "custom story books for kids",
    "kids book with child's name and photo",
    "alphabet book personalised",
    "personalised bedtime story book",
  ],
});

export default async function StoriesPage() {
  // Server-fetched: the catalogue ships in the HTML instead of behind a spinner.
  const stories = await getStories();

  const fromPdf = stories.length
    ? Math.min(...stories.map((s) => s.pdfPrice))
    : FACTS.fromPdfPrice;
  const fromPrint = stories.length
    ? Math.min(...stories.map((s) => s.printPrice))
    : FACTS.fromPrintPrice;
  const categories = Array.from(new Set(stories.map((s) => s.categoryTag)));

  return (
    <div className="py-12 md:py-16">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Story Library", path: "/stories" },
          ]),
          webPageJsonLd({
            path: "/stories",
            name: "Browse all personalised children's books | KuttyStory",
            description:
              "The full KuttyStory catalogue of personalised children's books, for ages 1-8.",
            type: "CollectionPage",
          }),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "The KuttyStory Library",
            url: `${SITE_URL}/stories`,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: stories.length,
              itemListElement: stories.map((s, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: s.title,
                url: abs(`/stories/${s.slug}`),
              })),
            },
          },
          faqJsonLd(FAQS.slice(0, 6)),
        ]}
      />

      <div className="container-x">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
            Personalised story books for kids
          </h1>
          <p
            className="mx-auto mt-3 max-w-2xl text-slate-mutedText"
            data-speakable
          >
            {stories.length} titles for ages {FACTS.ageRange}, each one
            personalised with your child&apos;s name, face and character look.
            The preview is always free - PDF from {inr(fromPdf)}, printed
            hardcover from {inr(fromPrint)} with free delivery across India.
          </p>
        </header>

        <StoryLibrary stories={stories} />
      </div>

      <section className="mt-16 bg-white py-16">
        <div className="container-x">
          <Prose>
            <ProseH2>How to choose the right book</ProseH2>
            <p>
              With picture books, the child&apos;s age decides more than the
              theme does. A two-year-old wants rhythm, repetition and something
              to point at; a six-year-old wants a plot with a problem in it. Use
              the age label on each cover as the first filter and the theme as
              the second.
            </p>
            <p>
              The library currently spans{" "}
              {categories.map((c, i) => (
                <span key={c}>
                  {i > 0 && (i === categories.length - 1 ? " and " : ", ")}
                  <strong className="text-slate-deep">{c.toLowerCase()}</strong>
                </span>
              ))}{" "}
              titles. Learning books turn letters and numbers into scenes your
              child stars in. Adventure titles put them in charge of a mission.
              Bedtime titles are deliberately slow and end with your child
              asleep. Imagination titles sit in between - big, colourful worlds
              with a gentle lesson.
            </p>

            <ProseH2>What is the same in every title</ProseH2>
            <KeyFacts
              caption="Every book in the KuttyStory library"
              rows={[
                ["Personalisation", "Your child's first name in the text and their face in the artwork, on every page"],
                ["Length", "24-28 illustrated pages, plus a dedication page you write yourself"],
                ["Language", "English (Tamil editions are planned)"],
                ["Free preview", `Front cover and the first ${FACTS.freePreviewPages} pages, before payment`],
                ["Formats", `Instant PDF from ${inr(fromPdf)}, or a printed hardcover from ${inr(fromPrint)}`],
                ["Delivery", `Free across India; ${FACTS.productionDaysMin}-${FACTS.productionDaysMax} days to produce, then 2-7 days in transit`],
                ["Boy and girl artwork", "Titles authored for both show the cover your child will actually get"],
                ["Re-generation", "Do not like how a face came out? Upload another photo and try again, free"],
              ]}
            />

            <ProseH2>Buying one as a gift</ProseH2>
            <p>
              If you are ordering for someone else&apos;s child, you need two
              things: their first name spelled the way the family spells it, and
              one clear, front-facing photo. Ask for a recent one taken near a
              window - it makes a visible difference to how much the
              illustration looks like them.
            </p>
            <p>
              Gifting to a whole birthday party is common enough that it has its
              own page:{" "}
              <Link
                href="/birthday-return-gifts"
                className="font-semibold text-brand-primary hover:underline"
              >
                personalised books as birthday return gifts
              </Link>
              , including the bulk discount and how far ahead to order.
            </p>
          </Prose>
        </div>
      </section>

      <Faq
        items={FAQS.slice(0, 6)}
        title="Questions before you personalise"
      />

      <RelatedLinks
        links={[
          {
            label: "How it works",
            href: "/how-it-works",
            note: "Photo to finished book, step by step",
          },
          {
            label: "Birthday return gifts",
            href: "/birthday-return-gifts",
            note: "Bulk orders, timing and pricing",
          },
          {
            label: "How to take the photo",
            href: "/guides/best-photo-for-a-personalised-book",
            note: "The five-minute version that makes the art look right",
          },
          {
            label: "Choosing by age",
            href: "/guides/choosing-a-personalised-book-by-age",
            note: "What works at 1, at 4 and at 7",
          },
        ]}
      />
    </div>
  );
}
