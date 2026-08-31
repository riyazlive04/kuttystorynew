import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StoryCard } from "@/components/StoryCard";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { KeyFacts, Prose, ProseH2, ProseH3, RelatedLinks } from "@/components/Prose";
import { GIFT_FAQS } from "@/lib/faqs";
import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import { inr } from "@/lib/format";
import {
  FACTS,
  WHATSAPP_URL,
  breadcrumbJsonLd,
  faqJsonLd,
  itemListJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

export const revalidate = STORY_REVALIDATE;

const TITLE = "Birthday Return Gifts for Kids: Personalised Books";
const DESCRIPTION =
  "Personalised story books as birthday return gifts in India. Each child gets a book with their own name and face inside. 20% off two or more with STORY20, free delivery, or an instant PDF when the party is close.";

export const metadata: Metadata = pageMeta({
  title: TITLE,
  description: DESCRIPTION,
  path: "/birthday-return-gifts",
  keywords: [
    "birthday return gifts for kids",
    "return gift ideas for kids birthday India",
    "personalised return gifts",
    "book return gift for birthday party",
    "unique return gifts for children",
    "1st birthday return gift ideas India",
  ],
});

export default async function ReturnGiftsPage() {
  const stories = await getStories();
  const picks = stories.slice(0, 3);
  const fromPdf = stories.length
    ? Math.min(...stories.map((s) => s.pdfPrice))
    : FACTS.fromPdfPrice;
  const fromPrint = stories.length
    ? Math.min(...stories.map((s) => s.printPrice))
    : FACTS.fromPrintPrice;

  return (
    <div>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Birthday Return Gifts", path: "/birthday-return-gifts" },
          ]),
          webPageJsonLd({
            path: "/birthday-return-gifts",
            name: TITLE,
            description: DESCRIPTION,
          }),
          itemListJsonLd(
            "Personalised books that work as birthday return gifts",
            picks.map((s) => ({ name: s.title, path: `/stories/${s.slug}` })),
          ),
          faqJsonLd(GIFT_FAQS),
        ]}
      />

      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          Birthday return gifts that don&apos;t end up in a drawer
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-slate-mutedText"
          data-speakable
        >
          A personalised story book is a return gift with the child&apos;s own
          name and face inside it, so it gets kept and re-read instead of
          discarded. Instant PDFs start at {inr(fromPdf)} and printed hardcovers
          at {inr(fromPrint)} with free delivery across India, and two or more
          books get 20% off with the code STORY20.
        </p>
        <Link href="/stories" className="btn-primary mt-8 inline-flex text-base">
          Browse the library <ArrowRight className="h-5 w-5" />
        </Link>
      </section>

      <section className="bg-white py-16">
        <div className="container-x">
          <Prose>
            <ProseH2>Why a book beats the usual return gift</ProseH2>
            <p>
              Most return gifts are chosen to be cheap enough for twenty guests
              and end up in the same place - a drawer, then a bin. A personalised
              book fails that test on price and wins on everything else: it is
              made for one specific child, it has their name on the cover, and
              parents put it on a shelf rather than throwing it away.
            </p>
            <p>
              The honest trade-off is cost per guest. At {inr(fromPrint)} a
              hardcover, this is not a twenty-child giveaway. It works when the
              guest list is small, when you want a headline gift for a handful of
              close friends alongside something simpler for everyone else, or
              when you buy the {inr(fromPdf)} PDF edition and let each family
              print or read it themselves.
            </p>

            <ProseH2>How to order for a party</ProseH2>
            <ProseH3>1. Collect names and photos early</ProseH3>
            <p>
              You need each child&apos;s first name, spelled the way their family
              spells it, and one clear front-facing photo. Ask on the group chat
              a fortnight before the party - this is the step that actually
              causes delays, not production.
            </p>
            <ProseH3>2. Pick one title, or let it vary</ProseH3>
            <p>
              A single title across the whole party keeps things simple and makes
              the books feel like a set. If the ages spread widely, split it:
              bedtime and alphabet books for the under-fours, adventures for the
              older ones.
            </p>
            <ProseH3>3. Order two weeks ahead for print</ProseH3>
            <p>
              Printed hardcovers take {FACTS.productionDaysMin}-
              {FACTS.productionDaysMax} days to produce and then 2-7 days in
              transit depending on your state. Two weeks is comfortable. If the
              party is sooner, the instant PDF is ready minutes after payment.
            </p>
            <ProseH3>4. Use STORY20 and tell us the count</ProseH3>
            <p>
              Two or more books take 20% off with the code STORY20 at checkout.
              For a party-sized batch,{" "}
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand-primary hover:underline"
              >
                message us on WhatsApp
              </a>{" "}
              with the number of books and the date you need them by, and we will
              confirm the timeline before you pay for anything.
            </p>

            <ProseH2>The practical numbers</ProseH2>
            <KeyFacts
              caption="Ordering personalised books as return gifts"
              rows={[
                ["Cost per child", `From ${inr(fromPdf)} (PDF) or ${inr(fromPrint)} (printed hardcover)`],
                ["Bulk discount", "20% off two or more books with the code STORY20"],
                ["What you need per child", "First name, age, and one clear front-facing photo"],
                ["Lead time, printed", `${FACTS.productionDaysMin}-${FACTS.productionDaysMax} days to make, then 2-7 days in transit - order 2 weeks ahead`],
                ["Lead time, PDF", "Minutes after payment"],
                ["Delivery", "Free to every state in India"],
                ["Ages", FACTS.ageRange],
                ["Personal message", "Every book has a dedication page you write yourself"],
                ["Payment", "UPI, cards and net banking via Razorpay"],
              ]}
            />

            <ProseH2>Other occasions parents use these for</ProseH2>
            <p>
              Return gifts are the most common ask, but the same book works for a
              first birthday or naming day, Diwali and Christmas, a new baby
              arriving and an older sibling needing something of their own, a
              first day of school, or grandparents overseas who want to send
              something that is not another toy.
            </p>
          </Prose>
        </div>
      </section>

      {picks.length > 0 && (
        <section className="container-x py-16">
          <h2 className="mb-8 text-center text-3xl font-bold text-slate-deep md:text-4xl">
            Good books to gift
          </h2>
          <div className="grid justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((s, i) => (
              <StoryCard key={s.id} story={s} index={i} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/stories" className="btn-outline inline-flex text-base">
              See all titles <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      )}

      <Faq
        items={GIFT_FAQS}
        title="Return gift questions"
        intro="Everything parents ask before ordering books for a party."
      />

      <RelatedLinks
        links={[
          {
            label: "How it works",
            href: "/how-it-works",
            note: "Photo to finished book, step by step",
          },
          {
            label: "Choosing a book by age",
            href: "/guides/choosing-a-personalised-book-by-age",
            note: "What suits 1, 4 and 7 year olds",
          },
          {
            label: "Taking the photo",
            href: "/guides/best-photo-for-a-personalised-book",
            note: "The difference between an okay likeness and a great one",
          },
          {
            label: "Contact us",
            href: "/contact",
            note: "WhatsApp for bulk orders and deadlines",
          },
        ]}
      />
    </div>
  );
}
