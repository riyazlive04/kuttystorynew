export type CategoryTag = "LEARNING" | "IMAGINATION" | "ADVENTURE" | "BEDTIME";

export type Language = "en" | "ta" | "bilingual";

export type Format = "pdf" | "print";

export interface Story {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  categoryTag: CategoryTag;
  ageRange: string;
  pdfPrice: number;
  printPrice: number;
  bilingualAddon: number;
  pages: number;
  coverImage: string;
  gallery: string[];
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

export interface Order extends OrderInput {
  id: string;
  status: "pending" | "paid" | "in_production" | "shipped" | "delivered";
  createdAt: string;
}
