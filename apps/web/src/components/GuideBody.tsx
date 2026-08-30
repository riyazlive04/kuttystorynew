import Link from "next/link";
import type { Block } from "@/lib/guides";
import { KeyFacts, ProseH2, ProseH3 } from "./Prose";

/**
 * Renders a guide's block list as plain semantic HTML on the server.
 *
 * Guide copy is stored as data rather than JSX so the same text can be reused
 * by the llms.txt digest and by any future feed without being scraped back out
 * of a component. That means the copy needs *some* inline formatting, so a
 * deliberately tiny subset of Markdown is supported — `[label](/path)` links
 * and `**bold**` — parsed here rather than by pulling in a Markdown renderer
 * and, with it, an HTML sanitiser we would then have to trust.
 */
const INLINE = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*)/g;

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      // Internal links go through next/link so they prefetch and stay in the
      // client router; anything absolute is treated as external.
      return href.startsWith("/") ? (
        <Link
          key={key}
          href={href}
          className="font-semibold text-brand-primary hover:underline"
        >
          {label}
        </Link>
      ) : (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-primary hover:underline"
        >
          {label}
        </a>
      );
    }

    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <strong key={key} className="font-semibold text-slate-deep">
          {bold[1]}
        </strong>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

export function GuideBody({
  sections,
}: {
  sections: { h2: string; blocks: Block[] }[];
}) {
  return (
    <>
      {sections.map((section, si) => (
        <section key={section.h2}>
          <ProseH2>{section.h2}</ProseH2>
          {section.blocks.map((b, bi) => {
            const key = `${si}-${bi}`;
            switch (b.type) {
              case "p":
                return <p key={key}>{inline(b.text, key)}</p>;
              case "h3":
                return <ProseH3 key={key}>{b.text}</ProseH3>;
              case "ul":
                return (
                  <ul key={key} className="list-disc space-y-2 pl-5">
                    {b.items.map((it, i) => (
                      <li key={i}>{inline(it, `${key}-${i}`)}</li>
                    ))}
                  </ul>
                );
              case "ol":
                return (
                  <ol key={key} className="list-decimal space-y-2 pl-5">
                    {b.items.map((it, i) => (
                      <li key={i}>{inline(it, `${key}-${i}`)}</li>
                    ))}
                  </ol>
                );
              case "table":
                return (
                  <div key={key} className="!my-7">
                    <KeyFacts caption={b.caption} rows={b.rows} />
                  </div>
                );
            }
          })}
        </section>
      ))}
    </>
  );
}
