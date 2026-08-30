import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { Prose, ProseH2, RelatedLinks } from "@/components/Prose";
import {
  FACTS,
  WHATSAPP_URL,
  breadcrumbJsonLd,
  organizationJsonLd,
  pageMeta,
  webPageJsonLd,
} from "@/lib/seo";

const PAGE_TITLE = "Contact Us - WhatsApp, Email & Bulk Orders";
const TITLE = "Contact KuttyStory";
const DESCRIPTION =
  "Reach KuttyStory about an order, a bulk return-gift enquiry or a photo you would like deleted. WhatsApp is fastest; email us at packitize@gmail.com.";

export const metadata: Metadata = pageMeta({
  title: PAGE_TITLE,
  description: DESCRIPTION,
  path: "/contact",
  keywords: [
    "KuttyStory contact",
    "KuttyStory customer care",
    "personalised book bulk order India",
  ],
});

/**
 * A crawlable contact page, not just a mailto in the footer. Two reasons it
 * earns its URL: search engines read a real contact page as a trust signal for
 * a shop asking for money and a child's photograph, and answer engines asked
 * "how do I contact KuttyStory" need a page to point at rather than guessing.
 *
 * No response-time promise is made here on purpose — an SLA we have not
 * committed to would be a claim the business has not agreed to keep.
 */
export default function ContactPage() {
  return (
    <div>
      <JsonLd
        data={[
          organizationJsonLd(),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
          webPageJsonLd({
            path: "/contact",
            name: TITLE,
            description: DESCRIPTION,
            type: "ContactPage",
          }),
        ]}
      />

      <section className="container-x py-14 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          Contact KuttyStory
        </h1>
        <p
          className="mx-auto mt-4 max-w-2xl text-slate-mutedText"
          data-speakable
        >
          WhatsApp is the fastest way to reach us - about an order in progress, a
          bulk return-gift enquiry, a delivery deadline, or a photo you would
          like deleted. Email works too.
        </p>
      </section>

      <section className="container-x pb-6">
        <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex flex-col gap-2 p-7 transition hover:border-brand-primary"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#25D366]/10 text-[#128C7E]">
              <MessageCircle className="h-6 w-6" />
            </span>
            <h2 className="mt-2 text-lg font-bold text-slate-deep">WhatsApp</h2>
            <p className="text-sm text-slate-mutedText">
              Order questions, bulk enquiries and anything urgent. Message us and
              we will pick it up.
            </p>
          </a>

          <a
            href={`mailto:${FACTS.contactEmail}`}
            className="card flex flex-col gap-2 p-7 transition hover:border-brand-primary"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <Mail className="h-6 w-6" />
            </span>
            <h2 className="mt-2 text-lg font-bold text-slate-deep">Email</h2>
            <p className="text-sm text-slate-mutedText">
              {FACTS.contactEmail} - best for refunds, reprints and data or
              deletion requests, where a written trail helps.
            </p>
          </a>
        </div>
      </section>

      <section className="mt-10 bg-white py-16">
        <div className="container-x">
          <Prose>
            <ProseH2>What to include</ProseH2>
            <p>
              For an existing order, send the order id and the child&apos;s name
              on the book - that is enough for us to find it. For a printed copy
              that arrived damaged or misprinted, add photographs of the problem;
              per the{" "}
              <Link
                href="/terms"
                className="font-semibold text-brand-primary hover:underline"
              >
                terms
              </Link>
              , that has to reach us within 7 days of delivery for a reprint or
              refund.
            </p>

            <ProseH2>Bulk and return-gift enquiries</ProseH2>
            <p>
              Tell us how many books you need and the date you need them by. We
              will confirm whether the printed timeline works before you pay for
              anything - and if it does not, the instant PDF almost always does.
              The{" "}
              <Link
                href="/birthday-return-gifts"
                className="font-semibold text-brand-primary hover:underline"
              >
                return gifts page
              </Link>{" "}
              covers pricing and lead times.
            </p>

            <ProseH2>Deleting a photo</ProseH2>
            <p>
              Uploaded photos are deleted once an order is complete and the
              reprint window has closed. If you want yours removed sooner, email{" "}
              <a
                href={`mailto:${FACTS.contactEmail}`}
                className="font-semibold text-brand-primary hover:underline"
              >
                {FACTS.contactEmail}
              </a>{" "}
              and we will delete it within 7 days. Requests to see, correct or
              delete other personal data are answered within 30 days, as set out
              in the{" "}
              <Link
                href="/privacy"
                className="font-semibold text-brand-primary hover:underline"
              >
                privacy policy
              </Link>
              .
            </p>
          </Prose>
        </div>
      </section>

      <RelatedLinks
        links={[
          { label: "How it works", href: "/how-it-works", note: "Before you order" },
          { label: "Browse the library", href: "/stories", note: "Every title" },
          { label: "About KuttyStory", href: "/about", note: "Who we are" },
          { label: "Terms of service", href: "/terms", note: "Refunds and reprints" },
        ]}
      />
    </div>
  );
}
