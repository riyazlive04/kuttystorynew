import Link from "next/link";

/**
 * Long-form copy blocks. Two things here are deliberate rather than cosmetic:
 *
 * 1. Everything renders server-side as plain semantic HTML - h2/h3/p/ul/table.
 *    Answer engines parse the DOM they are served, and a heading they can read
 *    is what becomes the anchor of a quoted passage.
 * 2. `KeyFacts` is a real <table> of short, unhedged facts. Tables are the
 *    single most reliably extracted structure in AI Overviews and Perplexity
 *    answers, far more so than the same numbers buried in a paragraph.
 */

export function Prose({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto max-w-3xl space-y-4 text-[15px] leading-relaxed text-slate-mutedText ${className}`}
    >
      {children}
    </div>
  );
}

export function ProseH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="!mt-10 text-2xl font-bold text-slate-deep md:text-3xl">
      {children}
    </h2>
  );
}

export function ProseH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="!mt-7 text-lg font-bold text-slate-deep">{children}</h3>
  );
}

export function ProseList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/**
 * The at-a-glance table. Keep every value to one short, checkable statement -
 * a value that needs a clause to qualify it belongs in the prose instead.
 */
export function KeyFacts({
  caption,
  rows,
}: {
  caption: string;
  rows: [string, string][];
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border-2 border-brand-borderAccent bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="px-6 pt-5 text-left text-base font-bold text-slate-deep">
          {caption}
        </caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-slate-100 first:border-t-0">
              <th
                scope="row"
                className="w-2/5 whitespace-normal px-6 py-3.5 align-top font-semibold text-slate-deep"
              >
                {k}
              </th>
              <td className="px-6 py-3.5 align-top text-slate-mutedText">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A crawlable block of contextual links. Related-link modules are how a small
 * catalogue site spreads authority to the pages that have no navigation slot.
 */
export function RelatedLinks({
  title = "Keep reading",
  links,
}: {
  title?: string;
  links: { label: string; href: string; note?: string }[];
}) {
  return (
    <section className="container-x py-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-5 text-xl font-bold text-slate-deep">{title}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-2xl border-2 border-brand-borderAccent bg-white px-5 py-4 transition hover:border-brand-primary"
              >
                <span className="font-semibold text-slate-deep">{l.label}</span>
                {l.note && (
                  <span className="mt-0.5 block text-sm text-slate-mutedText">
                    {l.note}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
