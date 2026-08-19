/**
 * Emits a schema.org JSON-LD block. Server-only by design — the payload must be
 * in the initial HTML for crawlers that never run our JavaScript.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify output is escaped for the one character that can
          // break out of a <script> block.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(d).replace(/</g, "\u003c"),
          }}
        />
      ))}
    </>
  );
}
