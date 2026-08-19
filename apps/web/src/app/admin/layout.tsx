import type { Metadata } from "next";
import { AdminShell } from "@/components/AdminShell";
import { NOINDEX } from "@/lib/seo";

// Server layout wrapper so the admin tree can carry `noindex` metadata — the
// interactive shell itself is a client component.
export const metadata: Metadata = {
  title: "Admin | KuttyStory",
  robots: NOINDEX,
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
