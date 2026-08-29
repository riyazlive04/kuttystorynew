import type { Story } from "./types";

/**
 * Canonical origin for the storefront. Everything that has to emit an absolute
 * URL (metadataBase, sitemap, JSON-LD) reads it from here so there is exactly
 * one place to change when the domain moves.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://kuttystory.co.in"
).replace(/\/$/, "");

export const SITE_NAME = "KuttyStory";

export const abs = (path: string): string =>
  path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Routes that must never be indexed — transactional or admin surfaces. */
export const PRIVATE_PATHS = [
  "/admin",
  "/cart",
  "/checkout",
  "/order",
  "/preview",
];

/** `robots` metadata block for pages that should stay out of the index. */
export const NOINDEX = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: { index: false, follow: false },
} as const;

/**
 * Facebook, WhatsApp and X all refuse to render SVG social cards, and the
 * current covers are still placeholder SVGs. Returns the cover only when it is
 * a raster image; otherwise null, so the route falls back to the generated
 * site-wide PNG card from `app/opengraph-image.tsx`.
 */
export function socialImage(src: string): string | null {
  return /\.svg($|\?)/i.test(src) ? null : abs(src);
}

/* ------------------------------------------------------------------ */
/*  JSON-LD builders                                                    */
/* ------------------------------------------------------------------ */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: abs("/logo.png"),
    description:
      "Personalized children's storybooks that make your child the hero, in English and Tamil. Instant PDF or premium printed hardcover, delivered across India.",
    areaServed: "IN",
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "packitize@gmail.com",
        availableLanguage: ["en", "ta"],
      },
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ["en-IN", "ta-IN"],
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: abs(t.path),
    })),
  };
}

/**
 * A story is sold in two variants (instant PDF / printed hardcover), so it maps
 * to a Product with an AggregateOffer spanning both price points.
 *
 * Deliberately no `aggregateRating`: the on-page 4.9 is a design placeholder
 * with no verifiable review count behind it, and marking up ratings that aren't
 * backed by real reviews is a structured-data violation.
 */
export function storyJsonLd(story: Story) {
  const url = abs(`/stories/${story.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: story.title,
    description: story.description,
    url,
    image: [story.coverImage, ...story.gallery].map(abs),
    sku: story.id,
    category: "Personalized children's books",
    brand: { "@type": "Brand", name: SITE_NAME },
    inLanguage: story.supportsTamil ? ["en-IN", "ta-IN"] : ["en-IN"],
    audience: {
      "@type": "PeopleAudience",
      suggestedMinAge: minAge(story.ageRange),
      suggestedMaxAge: maxAge(story.ageRange),
    },
    numberOfPages: story.pages,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: Math.min(story.pdfPrice, story.printPrice),
      highPrice: Math.max(story.pdfPrice, story.printPrice),
      offerCount: 2,
      availability: "https://schema.org/InStock",
      url,
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  };
}

/** "Ages 2-6" -> 2 / 6. Falls back to a sane range when the label is freeform. */
function minAge(ageRange: string): number {
  const m = ageRange.match(/(\d+)/);
  return m ? Number(m[1]) : 2;
}

function maxAge(ageRange: string): number {
  const m = ageRange.match(/(\d+)\D+(\d+)/);
  return m ? Number(m[2]) : 8;
}
