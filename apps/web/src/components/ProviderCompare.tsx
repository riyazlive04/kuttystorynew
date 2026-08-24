"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import {
  compareProviders,
  mediaUrl,
  type CompareResult,
} from "@/lib/compare";

/**
 * Upload a photo and see the same page rendered by each image provider.
 *
 * `adminToken` switches the view from the customer-facing one (neutral
 * "Style A / Style B" tiles) to the operator one (vendor names, elapsed time and
 * indicative per-image cost). The backend decides what to disclose — passing no
 * token means the response simply doesn't contain vendor detail, rather than the
 * component hiding something it was sent.
 */
export default function ProviderCompare({
  slug,
  variant = "boy",
  adminToken,
  title = "See your child in the story",
  blurb = "Upload a clear, front-facing photo and we'll show you a page from the book in a few different styles.",
}: {
  slug: string;
  variant?: string;
  adminToken?: string;
  title?: string;
  blurb?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = Boolean(adminToken);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    // Revoke the previous object URL before replacing it, or each upload leaks
    // a blob for the lifetime of the page.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    try {
      setResult(await compareProviders({ file, slug, variant, adminToken }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      // Let the same file be re-picked (change doesn't fire for an identical file).
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="card p-6">
      <h2 className="text-xl font-bold text-slate-deep">{title}</h2>
      <p className="mt-1 text-sm text-slate-mutedText">{blurb}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {busy ? "Creating…" : "Upload a photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- blob: object URL
          <img
            src={preview}
            alt="The photo you uploaded"
            className="h-12 w-12 rounded-full object-cover ring-2 ring-brand-borderAccent"
          />
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      )}

      {busy && (
        <p className="mt-4 text-sm text-slate-mutedText">
          Drawing your page — this usually takes a few seconds.
        </p>
      )}

      {result && (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {result.tiles.map((t) => (
              <figure key={t.id} className="overflow-hidden rounded-2xl border-2 border-brand-borderAccent">
                {t.url ? (
                  <Image
                    src={mediaUrl(t.url)}
                    alt={`${t.label} rendering of this page`}
                    width={1024}
                    height={1024}
                    unoptimized
                    className="aspect-square w-full bg-slate-50 object-cover"
                  />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-slate-50 px-4 text-center text-sm text-slate-mutedText">
                    {t.error || "Couldn't generate this one."}
                  </div>
                )}
                <figcaption className="flex items-baseline justify-between gap-2 px-3 py-2">
                  <span className="text-sm font-bold text-slate-deep">{t.label}</span>
                  {isAdmin && (
                    <span className="text-xs font-semibold text-slate-mutedText">
                      {typeof t.ms === "number" && `${(t.ms / 1000).toFixed(1)}s`}
                      {typeof t.estCostUsd === "number" &&
                        ` · ~$${t.estCostUsd.toFixed(3)}`}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>

          {isAdmin && (
            <p className="mt-3 text-xs text-slate-400">
              Page {result.pageNumber} · {result.variant} variant. Same base plate,
              same photo, same face region — the provider is the only difference.
              Costs are indicative; the vendor&apos;s pricing page is authoritative.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
