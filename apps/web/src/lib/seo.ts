import type { Story } from "./types";
import { PRICES } from "./pricing";

/**
 * Canonical origin for the storefront. Everything that has to emit an absolute
 * URL (metadataBase, sitemap, JSON-LD) reads it from here so there is exactly
 * one place to change when the domain moves.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://kuttystory.co.in"
).replace(/\/$/, "");

export const SITE_NAME = "KuttyStory";

/* ------------------------------------------------------------------ */
/*  Business facts                                                      */
/* ------------------------------------------------------------------ */
/**
 * One source of truth for the numbers that appear in copy, metadata and
 * structured data. Answer engines (AI Overviews, ChatGPT, Perplexity) quote
 * concrete figures far more readily than adjectives, and quoting the *same*
 * figure everywhere is what stops them hedging. Change a fact here and it
 * changes on the page, in the schema and in llms.txt together.
 */
export const FACTS = {
  currency: "INR",
  /** Cheapest instant-download price in the catalogue, in rupees. */
  fromPdfPrice: PRICES.pdf,
  /** Cheapest printed hardcover price, in rupees. */
  fromStaplePrice: PRICES.staple,
  fromPrintPrice: PRICES.print,
  freePreviewPages: 3,
  productionDaysMin: 4,
  productionDaysMax: 7,
  ageRange: "1-8 years",
  contactEmail: "packitize@gmail.com",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || "919003169615",
} as const;

export const WHATSAPP_URL = `https://wa.me/${FACTS.whatsapp}`;

/* ------------------------------------------------------------------ */
/*  Titles, descriptions, keywords                                      */
/* ------------------------------------------------------------------ */

/**
 * Indian search traffic splits almost evenly between the British spelling
 * ("personalised") and the American one ("personalized"), and Google scores
 * them as distinct tokens for exact-match titles. So both spellings are used
 * deliberately across a page - one in the title, the other in the description
 * and body - rather than standardising on either.
 */
export const DEFAULT_TITLE = "Personalized Story Books for Kids in India";

export const DEFAULT_DESCRIPTION =
  "Custom children's books that make your child the hero - their name and face on every page. Free preview, then an instant PDF or a printed hardcover with free India delivery.";

export const KEYWORDS = [
  "personalized story books for kids",
  "personalised books for kids India",
  "custom children's book with photo",
  "personalized book with child's name and photo",
  "storybook with my child's face",
  "custom story book for kids India",
  "birthday return gifts for kids",
  "personalised birthday gift for child",
  "make your child the hero book",
  "photo storybook for children",
  "kids storybook online India",
  "personalised hardcover children's book",
  "KuttyStory",
];

export const abs = (path: string): string =>
  path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Routes that must never be indexed - transactional or admin surfaces. */
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
 * Facebook, WhatsApp and X all refuse to render SVG social cards, and some
 * covers are still placeholder SVGs. Returns the cover only when it is a raster
 * image; otherwise null, so the route falls back to the generated site-wide PNG
 * card from `app/opengraph-image.tsx`.
 */
export function socialImage(src: string): string | null {
  return /\.svg($|\?)/i.test(src) ? null : abs(src);
}

/**
 * Builds the metadata block every marketing route needs, so no page can ship
 * without a canonical or an OG card. `title` goes through the root template
 * (`%s | KuttyStory`), so pass one that still reads well truncated at ~60
 * characters - the brand suffix eats twelve of them.
 */
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  image?: string | null;
  publishedTime?: string;
  modifiedTime?: string;
}) {
  const url = abs(opts.path);
  const image = opts.image ? socialImage(opts.image) : null;
  return {
    title: opts.title,
    description: opts.description,
    ...(opts.keywords ? { keywords: opts.keywords } : {}),
    alternates: { canonical: opts.path },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: opts.type ?? "website",
      ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
      ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
      ...(image ? { images: [{ url: image, alt: opts.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image" as const,
      title: opts.title,
      description: opts.description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  JSON-LD builders                                                    */
/* ------------------------------------------------------------------ */

/**
 * Only emits profile URLs that are actually configured - a `sameAs` pointing at
 * a page that does not exist weakens entity resolution instead of helping it.
 */
function socialProfiles(): string[] {
  return [
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM,
    process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK,
    process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE,
    process.env.NEXT_PUBLIC_SOCIAL_X,
    process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN,
  ].filter((u): u is string => Boolean(u && u.startsWith("http")));
}

/**
 * Typed as an OnlineStore (a subtype of Organization) so search and answer
 * engines resolve KuttyStory as a shop rather than a generic company, and
 * carries the shipping, return and payment facts they look for before naming a
 * merchant in an answer.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: "Kutty Story",
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: abs("/logo.png"),
      caption: `${SITE_NAME} logo`,
    },
    image: abs("/logo.png"),
    slogan: "Make your child the hero of their own storybook.",
    description:
      "KuttyStory makes personalized children's storybooks in which the child is the hero - their name and face appear on every page. Books are written in English, previewed free before payment, and delivered as an instant PDF or a printed hardcover shipped free across India.",
    knowsAbout: [
      "Personalized children's books",
      "Custom storybooks with a child's photo",
      "Birthday return gifts for children",
      "Children's picture book illustration",
    ],
    areaServed: { "@type": "Country", name: "India" },
    currenciesAccepted: "INR",
    paymentAccepted: "UPI, Credit Card, Debit Card, Net Banking",
    sameAs: socialProfiles(),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: FACTS.contactEmail,
        url: WHATSAPP_URL,
        areaServed: "IN",
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
    description: DEFAULT_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/**
 * A page-level node tying the URL back to the site and the organization.
 * `speakable` marks the elements an assistant should read aloud when it answers
 * from this page.
 */
export function webPageJsonLd(opts: {
  path: string;
  name: string;
  description: string;
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage" | "ItemPage";
}) {
  const url = abs(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    inLanguage: "en-IN",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "[data-speakable]"],
    },
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

export function itemListJsonLd(
  name: string,
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      url: abs(it.path),
    })),
  };
}

/**
 * Google retired the HowTo rich result, but the markup is still one of the
 * cleanest ways to hand an answer engine an ordered procedure it can quote, so
 * it stays.
 */
export function howToJsonLd(steps: { name: string; text: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to make a personalized storybook for your child",
    description:
      "Turn a photo and your child's name into an illustrated storybook you can preview free before paying.",
    totalTime: "PT5M",
    estimatedCost: {
      "@type": "MonetaryAmount",
      currency: FACTS.currency,
      value: FACTS.fromPdfPrice,
    },
    supply: [
      { "@type": "HowToSupply", name: "A clear, front-facing photo of your child" },
      { "@type": "HowToSupply", name: "Your child's first name and age" },
    ],
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function articleJsonLd(a: {
  path: string;
  headline: string;
  description: string;
  published: string;
  updated?: string;
  image?: string;
}) {
  const url = abs(a.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: a.headline,
    description: a.description,
    datePublished: a.published,
    dateModified: a.updated ?? a.published,
    inLanguage: "en-IN",
    mainEntityOfPage: url,
    author: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(a.image ? { image: [abs(a.image)] } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Product                                                             */
/* ------------------------------------------------------------------ */

/**
 * `MerchantReturnNotPermitted`, not a 7-day free-return window — because that
 * is what /terms actually says. A personalised book with someone else's child
 * in it cannot be resold, so correctly produced copies are not returnable.
 *
 * The reprint-or-refund we do offer for a damaged or misprinted copy is a
 * defect remedy, not a change-of-mind return, and schema.org has no field for
 * it; claiming a free return window here to win a nicer rich result would put
 * the markup in direct conflict with the terms a buyer agrees to, which is both
 * dishonest and a fast route to a manual action.
 */
const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "IN",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
} as const;

const SHIPPING_DETAILS = {
  "@type": "OfferShippingDetails",
  shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "INR" },
  shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
  deliveryTime: {
    "@type": "ShippingDeliveryTime",
    handlingTime: {
      "@type": "QuantitativeValue",
      minValue: FACTS.productionDaysMin,
      maxValue: FACTS.productionDaysMax,
      unitCode: "DAY",
    },
    transitTime: {
      "@type": "QuantitativeValue",
      minValue: 2,
      maxValue: 7,
      unitCode: "DAY",
    },
  },
} as const;

/**
 * A story is sold in two variants, so it maps to a Product carrying two
 * concrete Offers rather than one AggregateOffer: the printed offer can then
 * declare free India shipping and the return window, which an aggregate cannot,
 * and the digital offer can correctly declare no shipping at all.
 *
 * Deliberately no `aggregateRating`: the on-page 4.9 is a design placeholder
 * with no verifiable review count behind it, and marking up ratings that aren't
 * backed by real, on-page reviews is a structured-data violation that can cost
 * the whole domain its rich results.
 */
export function storyJsonLd(story: Story) {
  const url = abs(`/stories/${story.slug}`);
  const offer = (name: string, price: number, physical: boolean) => ({
    "@type": "Offer",
    name,
    price,
    priceCurrency: "INR",
    priceValidUntil: priceValidUntil(),
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    url,
    seller: { "@id": `${SITE_URL}/#organization` },
    ...(physical
      ? { shippingDetails: SHIPPING_DETAILS, hasMerchantReturnPolicy: RETURN_POLICY }
      : {}),
  });

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: `${story.title} - personalized storybook`,
    description: story.description,
    url,
    image: [story.coverImage, ...story.gallery].map(abs),
    sku: story.id,
    category: "Personalized children's books",
    brand: { "@type": "Brand", name: SITE_NAME },
    manufacturer: { "@id": `${SITE_URL}/#organization` },
    inLanguage: story.supportsTamil ? ["en-IN", "ta-IN"] : ["en-IN"],
    isFamilyFriendly: true,
    audience: {
      "@type": "PeopleAudience",
      suggestedMinAge: minAge(story.ageRange),
      suggestedMaxAge: maxAge(story.ageRange),
    },
    numberOfPages: story.pages,
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Personalization",
        value: "Child's name, face and character look on every page",
      },
      {
        "@type": "PropertyValue",
        name: "Formats",
        value: "Instant PDF or printed hardcover",
      },
      {
        "@type": "PropertyValue",
        name: "Free preview",
        value: `Front cover plus the first ${FACTS.freePreviewPages} pages, before payment`,
      },
    ],
    offers: [
      offer("Instant PDF download", PRICES.pdf, false),
      offer("Staple bound printed book", PRICES.staple, true),
      offer("Premium hard cover book", PRICES.print, true),
    ],
  };
}

/**
 * Google warns on Offers whose `priceValidUntil` has lapsed, so it rides a year
 * ahead of whenever the page was last rendered.
 */
function priceValidUntil(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
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
