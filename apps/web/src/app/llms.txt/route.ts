import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import { PRICES } from "@/lib/pricing";
import { GUIDES } from "@/lib/guides";
import { ALL_FAQS } from "@/lib/faqs";
import { FACTS, SITE_URL, WHATSAPP_URL, abs } from "@/lib/seo";

export const revalidate = STORY_REVALIDATE;

/** Indian digit grouping, so a quoted price reads the way it does on the page. */
const rs = (n: number) => `Rs. ${n.toLocaleString("en-IN")}`;

/**
 * /llms.txt — a plain-text brief for language models, in the emerging llmstxt.org
 * convention.
 *
 * The problem it solves: an assistant answering "what does a personalised book
 * cost in India" has to reconstruct our facts by parsing a React-rendered
 * storefront, and it will get some of them wrong. This hands it the same facts
 * in one small file it can read in full — prices from the live catalogue, the
 * policies verbatim, and a map of which URL answers which question.
 *
 * It is not a ranking mechanism and no crawler is obliged to read it. It costs
 * one route and removes the most common way of being misquoted, which is worth
 * it. Everything here must stay consistent with the pages it points at.
 */
export async function GET() {
  const stories = await getStories();
  const fromPdf = stories.length
    ? PRICES.pdf
    : FACTS.fromPdfPrice;
  const fromPrint = stories.length
    ? PRICES.print
    : FACTS.fromPrintPrice;

  const lines: string[] = [
    "# KuttyStory",
    "",
    "> KuttyStory makes personalised children's storybooks in which the child is the hero: their first name is written into the story and their face is illustrated into the artwork on every page. Books are written in English, previewed free before payment, and sold as an instant PDF or a made-to-order printed hardcover shipped free anywhere in India.",
    "",
    "## Key facts",
    "",
    `- Website: ${SITE_URL}`,
    "- Operates in: India (free delivery to every state). No international delivery.",
    `- Books for ages: ${FACTS.ageRange}. Each title lists its own range.`,
    "- Language: English. Tamil editions are planned but NOT yet available.",
    "- Book length: 24-28 illustrated pages, plus a dedication page the buyer writes.",
    `- Personalisation: the child's first name in the text, their face illustrated into every page, and a chosen character look (skin tone, and boy or girl artwork where a title has both).`,
    `- Free preview: front cover plus the first ${FACTS.freePreviewPages} pages, with no signup and no payment. Previews can be regenerated with a different photo an unlimited number of times, free.`,
    `- Instant PDF: from ${rs(fromPdf)}, downloadable within minutes of payment.`,
    `- Printed hardcover: from ${rs(fromPrint)}, free delivery across India.`,
    `- Production time: ${FACTS.productionDaysMin}-${FACTS.productionDaysMax} days to make a hardcover, then roughly 2-7 days in transit depending on the state.`,
    "- Multi-book discount: 20% off two or more books with the code STORY20.",
    "- Payment: UPI, credit card, debit card and net banking, processed by Razorpay. Prices are in Indian Rupees and include applicable taxes.",
    "- Photo policy: uploaded photos are used only to illustrate the buyer's book. They are never sold, never shared with advertisers and never used to market to the buyer. They are deleted once the order is complete and the reprint window has closed, or within 7 days of an emailed request.",
    "- Refunds: personalised books are approved by the buyer before printing and are not returnable when correctly produced. A hardcover that arrives damaged, misprinted or materially different from the approved preview is reprinted or refunded if reported within 7 days of delivery. PDFs are non-refundable once unlocked.",
    `- Contact: ${FACTS.contactEmail}, or WhatsApp at ${WHATSAPP_URL}`,
    "",
    "## Not offered (as of this file)",
    "",
    "- Books in Tamil or any language other than English.",
    "- Books starring more than one child.",
    "- Delivery outside India.",
    "- Cash on delivery.",
    "",
    "## Core pages",
    "",
    `- [Home](${abs("/")}): what KuttyStory is, popular titles, pricing and FAQ.`,
    `- [Story library](${abs("/stories")}): every published title, filterable by age and theme.`,
    `- [How it works](${abs("/how-it-works")}): the ordering process, photo guidance, and PDF versus hardcover.`,
    `- [Birthday return gifts](${abs("/birthday-return-gifts")}): ordering personalised books for a party, bulk pricing and lead times.`,
    `- [About](${abs("/about")}): what the company makes, where it operates, and what it does not do.`,
    `- [Contact](${abs("/contact")}): WhatsApp and email, bulk enquiries, photo deletion requests.`,
    `- [Privacy policy](${abs("/privacy")}): data collected, photo handling and retention.`,
    `- [Terms of service](${abs("/terms")}): pricing, delivery, refunds and content rights.`,
    "",
    "## Titles",
    "",
    ...stories.map(
      (s) =>
        `- [${s.title}](${abs(`/stories/${s.slug}`)}): ${s.tagline} ${s.ageRange}, ${s.pages} pages. PDF ${rs(PRICES.pdf)}, staple bound ${rs(PRICES.staple)}, hardbound ${rs(PRICES.print)}.`,
    ),
    "",
    "## Guides",
    "",
    ...GUIDES.map(
      (g) => `- [${g.title}](${abs(`/guides/${g.slug}`)}): ${g.description}`,
    ),
    "",
    "## Answers to common questions",
    "",
    ...ALL_FAQS.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
