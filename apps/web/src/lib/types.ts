export type CategoryTag = "LEARNING" | "IMAGINATION" | "ADVENTURE" | "BEDTIME";

export type Language = "en" | "ta" | "bilingual";

// The editions a customer can buy. Defined with the prices, so a new edition
// is added in one place.
import type { Format } from "./pricing";
export type { Format };

export interface Story {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  categoryTag: CategoryTag;
  ageRange: string;
  // The same range as numbers. The catalogue API has always sent these; they
  // were just never declared here. Optional because the bundled fallback data
  // has no age fields.
  minAge?: number;
  maxAge?: number;
  pdfPrice: number;
  printPrice: number;
  bilingualAddon: number;
  pages: number;
  coverImage: string;
  // The girl variant's front-cover art, for a book authored for both genders.
  // null/absent = coverImage is shown to everyone. Read it via coverFor().
  coverImageGirl?: string | null;
  gallery: string[];
  // A couple of the book's authored interior pages, sent by the catalogue API so
  // the storefront can show real pages. Absent on the bundled fallback data.
  samplePages?: string[];
  themeColor: string; // hex used for gradient accents
  supportsTamil: boolean;
  highlights: string[];
  // null/absent = offered for any child; otherwise only that gender.
  genderLock?: "boy" | "girl" | null;
  // The Spine page's artwork, shown on the book's edge in the storefront.
  spineImage?: string | null;
}

export interface Personalization {
  storySlug: string;
  childName: string;
  gender: "boy" | "girl" | "neutral";
  ageYears: number;
  language: Language;
  skinTone: "light" | "medium" | "tan" | "deep";
  photoDataUrl?: string; // client-side preview only
  photoUrl?: string; // primary uploaded raw photo (rawPhotoUrl)
  photoUrls?: string[]; // a few photos for stronger identity (Diffrun-style)
  dedication?: string;
}

export type JobStatus =
  | "queued"
  | "processing"
  | "rendering"
  | "completed"
  | "failed";

export type PageKind = "story" | "front_cover" | "back_cover" | "spine";

export interface PreviewPage {
  index: number; // slot in reading order — NOT the page number once covers exist
  pageNumber?: number; // 0 = front cover, -1 = back cover, 1..n = story page
  kind?: PageKind;
  imageUrl: string;
  caption: string;
  locked: boolean;
}

export interface Job {
  id: string;
  storySlug: string;
  storyTitle: string;
  childName: string;
  language: Language;
  status: JobStatus;
  progress: number; // 0..100
  pages: PreviewPage[];
  isPurchased?: boolean;
  printApproved?: boolean;
  pdfDownloadUrl?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface CartItem {
  id: string;
  jobId: string;
  storySlug: string;
  storyTitle: string;
  childName: string;
  format: Format;
  language: Language;
  coverImage: string;
  unitPrice: number;
  quantity: number;
}

export interface OrderInput {
  items: CartItem[];
  customer: {
    name: string;
    email: string;
    phone: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  subtotal: number;
  discount?: number;
  promoCode?: string;
  shipping: number;
  total: number;
}

export interface OrderTracking {
  courier?: string | null;
  number?: string | null;
  url?: string | null;
  sentAt?: string | null; // when the customer was emailed these details
}

export interface Order extends OrderInput {
  id: string;
  status: "pending" | "paid" | "in_production" | "shipped" | "delivered";
  /** Human-facing order number, e.g. "KS-0096". */
  orderNumber?: string;
  invoiceNo?: string | null;
  invoicedAt?: string | null;
  tracking?: OrderTracking;
  createdAt: string;
}
