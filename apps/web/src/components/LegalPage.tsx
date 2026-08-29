import Link from "next/link";

/**
 * Shared shell for the legal pages. Plain prose, one h1, real headings — these
 * exist to be readable and to be a trust signal, so they stay server-rendered
 * with no client JavaScript.
 */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container-x py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
          Last updated {updated}
        </p>
        <p className="mt-6 text-lg leading-relaxed text-slate-mutedText">
          {intro}
        </p>

        <div className="mt-10 space-y-10">{children}</div>

        <div className="mt-14 rounded-3xl border-2 border-brand-borderAccent bg-brand-lilac p-6 text-sm text-slate-mutedText">
          <p>
            Still have a question? Read{" "}
            <Link
              href="/how-it-works"
              className="font-semibold text-brand-primary hover:underline"
            >
              how KuttyStory works
            </Link>{" "}
            or email us at{" "}
            <a
              href="mailto:packitize@gmail.com"
              className="font-semibold text-brand-primary hover:underline"
            >
              packitize@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-2xl font-bold text-slate-deep">{title}</h2>
      <div className="legal-prose mt-3 space-y-3 leading-relaxed text-slate-mutedText">
        {children}
      </div>
    </section>
  );
}
