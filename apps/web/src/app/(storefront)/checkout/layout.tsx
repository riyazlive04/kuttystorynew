import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Transactional surface — no search value, and order/preview URLs carry
// customer-specific ids that must never reach an index.
export const metadata: Metadata = {
  title: "Checkout | KuttyStory",
  description: "Complete your KuttyStory order.",
  robots: NOINDEX,
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
