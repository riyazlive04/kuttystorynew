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
  return (
    <>
      {/* The page editor previews text in the family's CSS stack. Without the
          real Comic Neue loaded, Windows substituted Comic Sans MS — a font the
          renderer doesn't have — so the preview promised a face the book never
          printed. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap"
      />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
