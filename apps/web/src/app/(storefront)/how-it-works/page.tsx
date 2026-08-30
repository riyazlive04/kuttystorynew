import type { Metadata } from "next";
import Link from "next/link";
import { Steps } from "@/components/Marketing";
import { Faq } from "@/components/Faq";
import { JsonLd } from "@/components/JsonLd";
import { KeyFacts, Prose, ProseH2, ProseH3, RelatedLinks } from "@/components/Prose";
import { FAQS } from "@/lib/faqs";
import { HOW_TO_STEPS } from "@/lib/howto";
import {
  FACTS,
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";
import { ArrowRight, Truck, Palette, ShieldCheck, Globe2 } from "lucide-react";

const TITLE = "How to Make a Personalised Book for Your Child";
const DESCRIPTION =
  "How KuttyStory turns one photo and your child's name into an illustrated storybook: pick a story, preview the first 5 pages free, then choose an instant PDF or a printed hardcover delivered free across India.";

export const metadata: Metadata = pageMeta({
  title: TITLE,
  description: DESCRIPTION,
  path: "/how-it-works",
  keywords: [
    "how to make a personalised book for a child",
    "custom story book with photo how it works",
    "make a book with my child's face",
    "personalised book preview before paying",
  ],
});

export default function HowItWorksPage() {
  const perks = [
    {
      icon: Palette,
      title: "Studio-quality art",
      body: "Every page is a hand-crafted illustration, not a cheap filter.",
    },
    {
      icon: Globe2,
      title: "Written in English",
      body: "Read-aloud text with rhythm and repeat lines. Tamil editions are on the way.",
    },
    {
      icon: Truck,
      title: "Free India delivery",
      body: "Premium hardcovers shipped to your door at no extra cost.",
    },
    {
      icon: ShieldCheck,
      title: "Preview before you pay",
      body: "You approve the book first. Zero surprises, ever.",
    },
  ];

  return (
    <div>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "How It Works", path: "/how-it-works" },
          ]),
          webPageJsonLd({
            path: "/how-it-works",
            name: TITLE,
            description: DESCRIPTION,
          }),
          howToJsonLd(HOW_TO_STEPS),
          faqJsonLd(FAQS),
        ]}
      />

      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          How KuttyStory works
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-slate-mutedText"
          data-speakable
        >
          Choose a story, upload one clear photo of your child and type their
          name. About a minute later you get a free preview of the cover and the
          first {FACTS.freePreviewPages} pages. If you like it, unlock the
          instant PDF or order a printed hardcover - if you do not, you have paid
          nothing.
        </p>
      </section>

      <Steps />

      <section className="container-x py-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <div key={p.title} className="card p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
                <p.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 font-bold text-slate-deep">{p.title}</h3>
              <p className="mt-1.5 text-sm text-slate-mutedText">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 bg-white py-16">
        <div className="container-x">
          <Prose>
            <ProseH2>What happens to your photo</ProseH2>
            <p>
              The photo you upload is used for exactly one thing: illustrating
              your child into the artwork. It is never sold, never shared with
              advertisers and never used to market to you. It is deleted once
              your order is complete and the reprint window has closed, and if
              you want it gone sooner, email{" "}
              <a
                href={`mailto:${FACTS.contactEmail}`}
                className="font-semibold text-brand-primary hover:underline"
              >
                {FACTS.contactEmail}
              </a>{" "}
              and we will delete it within 7 days. Card and bank details go
              straight to Razorpay and never reach KuttyStory servers. The full
              detail is in the{" "}
              <Link
                href="/privacy"
                className="font-semibold text-brand-primary hover:underline"
              >
                privacy policy
              </Link>
              .
            </p>

            <ProseH2>Getting a likeness you are happy with</ProseH2>
            <p>
              The illustration is only as good as the photo it starts from. One
              clear, front-facing shot of your child&apos;s face, taken in
              daylight with nothing shading their eyes, is worth more than ten
              blurry ones.
            </p>
            <ProseH3>What helps</ProseH3>
            <ul className="list-disc space-y-2 pl-5">
              <li>Face filling a decent part of the frame, looking at the camera.</li>
              <li>Even, indirect light - near a window beats direct sun.</li>
              <li>No sunglasses, no hat brim across the eyes, hair off the face.</li>
              <li>Only your child in the frame, so there is no ambiguity about whose face to use.</li>
            </ul>
            <ProseH3>What to avoid</ProseH3>
            <ul className="list-disc space-y-2 pl-5">
              <li>Side profiles and three-quarter angles.</li>
              <li>Heavy backlight, harsh shadow, or a dim indoor shot.</li>
              <li>Motion blur, or a face that is small in a wide group photo.</li>
            </ul>
            <p>
              If a preview does not look like your child, upload a different
              photo and generate it again. Regenerating is free and unlimited,
              and it costs you nothing until you decide to buy.{" "}
              <Link
                href="/guides/best-photo-for-a-personalised-book"
                className="font-semibold text-brand-primary hover:underline"
              >
                The longer photo guide
              </Link>{" "}
              goes into more detail.
            </p>

            <ProseH2>PDF or printed hardcover?</ProseH2>
            <p>
              Both contain the same book. The difference is speed and permanence,
              and plenty of parents buy both - the PDF to open on the day, the
              hardcover to arrive later.
            </p>
            <KeyFacts
              caption="Instant PDF compared with a printed hardcover"
              rows={[
                ["Price", `From ${FACTS.fromPdfPrice} rupees (PDF) or ${FACTS.fromPrintPrice} rupees (hardcover)`],
                ["Ready when", "PDF: minutes after payment. Hardcover: made in 4-7 days, then 2-7 days in transit"],
                ["Best for", "PDF: a gift needed this week, or reading on a tablet. Hardcover: a keepsake, a party gift, a shelf"],
                ["Delivery", "PDF: none needed. Hardcover: free anywhere in India"],
                ["Changes after ordering", "Both are approved by you first; once a hardcover goes to print it cannot be changed"],
                ["If something is wrong", "Damaged or misprinted hardcovers are reprinted or refunded within 7 days of delivery"],
              ]}
            />

            <ProseH2>How long the whole thing takes</ProseH2>
            <p>
              Personalising and previewing takes about a minute. Unlocking the
              PDF is instant. A printed hardcover is made to order in{" "}
              {FACTS.productionDaysMin}-{FACTS.productionDaysMax} days and then
              ships free anywhere in India, typically arriving 2-7 days later
              depending on the state. For a birthday, order the printed book
              about two weeks ahead; for anything tighter, buy the PDF.
            </p>
          </Prose>
        </div>
      </section>

      <Faq />

      <RelatedLinks
        links={[
          {
            label: "Browse the story library",
            href: "/stories",
            note: "Every title, filterable by age and theme",
          },
          {
            label: "Birthday return gifts",
            href: "/birthday-return-gifts",
            note: "Ordering for a whole party",
          },
          {
            label: "About KuttyStory",
            href: "/about",
            note: "Who makes these books",
          },
          {
            label: "Contact us",
            href: "/contact",
            note: "WhatsApp and email, and when we reply",
          },
        ]}
      />

      <section className="container-x pb-20 text-center">
        <Link href="/stories" className="btn-primary inline-flex text-base">
          Start your free preview <ArrowRight className="h-5 w-5" />
        </Link>
      </section>
    </div>
  );
}
