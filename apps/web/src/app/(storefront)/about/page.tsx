import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { KeyFacts, Prose, ProseH2, RelatedLinks } from "@/components/Prose";
import {
  FACTS,
  SITE_URL,
  breadcrumbJsonLd,
  organizationJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

const PAGE_TITLE = "About Us - Personalised Books Made in India";
const TITLE = "About KuttyStory - Personalised Books Made in India";
const DESCRIPTION =
  "KuttyStory is an Indian storybook studio that makes personalised children's books in which your own child is the hero - name in the text, face in the artwork, previewed free before you pay.";

export const metadata: Metadata = pageMeta({
  title: PAGE_TITLE,
  description: DESCRIPTION,
  path: "/about",
  keywords: [
    "about KuttyStory",
    "personalised book company India",
    "who makes personalised children's books",
    "KuttyStory reviews",
  ],
});

/**
 * The entity page. When someone asks an assistant "what is KuttyStory" or "is
 * KuttyStory legit", this is the URL that has to answer it — so it states, in
 * plain declarative sentences, what the company sells, where it operates, what
 * it costs and what it does not do. Vagueness here is what makes an answer
 * engine describe you as "a website that appears to sell books".
 *
 * Everything asserted below is checkable against /terms, /privacy and the
 * catalogue. Do not add founder names, founding dates or an office address here
 * until they are real and verifiable — an unverifiable claim on an about page
 * is worse for trust signals than a missing one.
 */
export default function AboutPage() {
  return (
    <div>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
          ]),
          webPageJsonLd({
            path: "/about",
            name: TITLE,
            description: DESCRIPTION,
            type: "AboutPage",
          }),
        ]}
      />

      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          About KuttyStory
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-slate-mutedText"
          data-speakable
        >
          KuttyStory is an Indian storybook studio that makes personalised
          children&apos;s books in which your own child is the hero. Their first
          name is written into the story and their face is illustrated into the
          artwork, on every page. You see the book free before you pay, and it
          ships as an instant PDF or a printed hardcover, free anywhere in India.
        </p>
      </section>

      <section className="bg-white py-16">
        <div className="container-x">
          <Prose>
            <ProseH2>What the name means</ProseH2>
            <p>
              <em>Kutty</em> is the Tamil word for &ldquo;little one&rdquo; - what
              a parent in Tamil Nadu calls their child a hundred times a day. It
              is where the brand starts and who it is built for: Indian families
              buying a book for a small child. The books themselves are currently
              written in English, with Tamil editions in the works.
            </p>

            <ProseH2>What we actually make</ProseH2>
            <p>
              Each title is a 24-28 page illustrated picture book, professionally
              written to be read aloud. The personalisation is not a name
              stamped on a cover: your child&apos;s first name appears in the
              text, their likeness is illustrated into the scenes, and you choose
              the character look - skin tone, and boy or girl artwork where a
              title is authored for both. There is a dedication page at the front
              that you write yourself.
            </p>
            <p>
              Books are sold in two formats. The instant PDF is downloadable
              minutes after payment. The premium printed hardcover is made to
              order in {FACTS.productionDaysMin}-{FACTS.productionDaysMax} days
              and shipped free to any state in India.
            </p>

            <ProseH2>How we work</ProseH2>
            <p>
              The order of operations is deliberate: you see the book before any
              money changes hands. Personalising a story produces a free preview
              of the front cover and the first {FACTS.freePreviewPages} pages, no
              signup and no card details. If the likeness is not right, you
              upload another photo and generate it again, as many times as you
              want, still free. Only then do you decide whether to buy.
            </p>
            <p>
              For printed books there is a second approval: you sign off the full
              book before it goes to press. Once it is printing it cannot be
              changed, which is why the approval exists.
            </p>

            <ProseH2>What we do with your child&apos;s photo</ProseH2>
            <p>
              One purpose only - illustrating your book. Photos are never sold,
              never shared with advertisers and never used to market to you. They
              are deleted once the order is complete and the reprint window has
              closed, and sooner on request. Payments run through Razorpay, so
              card and banking details never reach KuttyStory servers. The
              specifics are in the{" "}
              <Link
                href="/privacy"
                className="font-semibold text-brand-primary hover:underline"
              >
                privacy policy
              </Link>
              .
            </p>

            <ProseH2>The facts, plainly</ProseH2>
            <KeyFacts
              caption="KuttyStory at a glance"
              rows={[
                ["What it is", "A studio making personalised children's picture books"],
                ["Website", SITE_URL.replace(/^https?:\/\//, "")],
                ["Operates in", "India - free delivery to every state"],
                ["Books for ages", FACTS.ageRange],
                ["Language", "English. Tamil editions planned, not yet available"],
                ["Formats", "Instant PDF, or a made-to-order printed hardcover"],
                ["Prices", `PDF from ${FACTS.fromPdfPrice} rupees, hardcover from ${FACTS.fromPrintPrice} rupees`],
                ["Free preview", `Cover plus the first ${FACTS.freePreviewPages} pages, no signup, no payment`],
                ["Payment", "UPI, credit card, debit card, net banking, via Razorpay"],
                ["Refunds", "Damaged or misprinted hardcovers reprinted or refunded within 7 days of delivery"],
                ["Support", `WhatsApp, or ${FACTS.contactEmail}`],
              ]}
            />

            <ProseH2>What we do not do</ProseH2>
            <p>
              We do not sell generic off-the-shelf children&apos;s books, we do
              not print books for anyone other than the person who ordered them,
              and we do not put a child in a book without a parent or guardian
              uploading the photo. We also do not currently offer Tamil editions,
              books starring more than one child, or delivery outside India - if
              you need one of those, tell us, because demand is how we decide
              what to build next.
            </p>
          </Prose>
        </div>
      </section>

      <RelatedLinks
        links={[
          {
            label: "How it works",
            href: "/how-it-works",
            note: "The full process, start to finish",
          },
          {
            label: "Browse the library",
            href: "/stories",
            note: "Every title we currently publish",
          },
          {
            label: "Contact us",
            href: "/contact",
            note: "WhatsApp and email",
          },
          {
            label: "Privacy policy",
            href: "/privacy",
            note: "What happens to photos and data",
          },
        ]}
      />

      <section className="container-x pb-20 text-center">
        <Link href="/stories" className="btn-primary inline-flex text-base">
          Make a book, free to preview <ArrowRight className="h-5 w-5" />
        </Link>
      </section>
    </div>
  );
}
