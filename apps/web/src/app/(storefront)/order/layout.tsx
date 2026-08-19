import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Transactional surface — no search value, and order/preview URLs carry
// customer-specific ids that must never reach an index.
export const metadata: Metadata = {
  title: "Your Order | KuttyStory",
  description: "Track the status of your KuttyStory order.",
  robots: NOINDEX,
};

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
