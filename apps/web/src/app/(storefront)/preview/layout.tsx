import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Transactional surface — no search value, and order/preview URLs carry
// customer-specific ids that must never reach an index.
export const metadata: Metadata = {
  title: "Your Free Preview | KuttyStory",
  description: "Your personalized storybook preview.",
  robots: NOINDEX,
};

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
