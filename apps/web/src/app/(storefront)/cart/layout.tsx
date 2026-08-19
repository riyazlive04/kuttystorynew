import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Transactional surface — no search value, and order/preview URLs carry
// customer-specific ids that must never reach an index.
export const metadata: Metadata = {
  title: "Your Cart | KuttyStory",
  description: "Review the personalized storybooks in your KuttyStory cart.",
  robots: NOINDEX,
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
