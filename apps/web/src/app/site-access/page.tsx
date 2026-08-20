import type { Metadata } from "next";

import SiteGate from "@/components/SiteGate";

export const metadata: Metadata = {
  title: "KuttyStory — Site under construction",
  // Overrides the root layout's index:true. Nothing should be indexed off the
  // back of the gate page while it's up.
  robots: { index: false, follow: false },
  // The root layout's og:/twitter: tags describe the product. Blank them out
  // so a gated page doesn't hand scrapers the full marketing pitch.
  description: "This site is currently under construction.",
  openGraph: {
    title: "KuttyStory — Site under construction",
    description: "This site is currently under construction.",
    images: [],
  },
  twitter: {
    title: "KuttyStory — Site under construction",
    description: "This site is currently under construction.",
    images: [],
  },
};

// The gate decision is per-request; never let this get statically cached.
export const dynamic = "force-dynamic";

export default function SiteAccessPage() {
  return <SiteGate />;
}
