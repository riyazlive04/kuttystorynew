"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Lock, RefreshCw } from "lucide-react";
import type { PreviewPage } from "@/lib/types";
import { inr } from "@/lib/format";
import { PAYWALL_PDF, PAYWALL_PRINT } from "./Paywall";

/**
 * Digital flip-book (Diffrun-style). You can flip through EVERY page: the free
 * pages render fully; locked pages show the authored illustration BLURRED with a
 * "Purchase to Unlock" teaser + inline pricing — a soft paywall that previews the
 * whole book to drive conversion, instead of a hard wall at page freeCount+1.
 */
export function FlipBook({
  pages,
  freeCount,
  totalPages,
  onSelect,
  onRegenerate,
  regeneratingPage,
}: {
  pages: PreviewPage[];
  freeCount: number;
  totalPages?: number;
  onSelect: (format: "pdf" | "print") => void;
  onRegenerate?: (pageNumber: number) => void;
  regeneratingPage?: number | null;
}) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState<"none" | "next" | "prev">("none");
  const lastIndex = pages.length - 1;
  const total = totalPages ?? pages.length;
  const locked = i >= freeCount; // current page behind the paywall?
  const page = pages[i];

  function go(dir: 1 | -1) {
    setI((v) => Math.max(0, Math.min(lastIndex, v + dir)));
    setFlip(dir === 1 ? "next" : "prev");
    setTimeout(() => setFlip("none"), 350);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, lastIndex]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="relative overflow-hidden rounded-3xl border-2 border-brand-borderAccent bg-white shadow-glow">
        <div
          className={`relative aspect-square w-full origin-left bg-slate-50 transition-transform duration-300 ${
            flip === "next" ? "animate-[flip_0.35s_ease]" : ""
          }`}
        >
          {page?.imageUrl ? (
            <Image
              key={page.imageUrl}
              src={page.imageUrl}
              alt={locked ? `Locked page ${i + 1}` : `Page ${i + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className={locked ? "scale-110 object-cover blur-2xl" : "object-contain"}
            />
          ) : locked ? (
            // Locked page with no base-art teaser — decorative placeholder.
            <div className="h-full w-full bg-gradient-to-br from-brand-lilac/60 to-brand-borderAccent" />
          ) : (
            // Free page still rendering — visible loader inside the page area.
            <div className="shimmer flex h-full w-full flex-col items-center justify-center gap-3">
              <Loader2 className="h-9 w-9 animate-spin text-brand-primary" />
              <span className="text-sm font-semibold text-slate-mutedText">
                Creating this page…
              </span>
            </div>
          )}

          {/* The story text is already burned into the page image (authored
              position, matches the print PDF), so no separate caption overlay. */}
        </div>

        {/* Locked-page teaser: blurred art shows through; unlock CTA on top. */}
        {locked && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4">
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900/70 px-3 py-1.5 text-xs font-bold text-white shadow-md">
              <Lock className="h-3.5 w-3.5" /> Purchase to Unlock
            </span>
            <div className="w-full max-w-sm rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
              <p className="text-center text-sm font-semibold text-slate-deep">
                Unlock all {total} personalized pages
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSelect("pdf")}
                  className="rounded-xl border-2 border-brand-primary py-2 text-sm font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                >
                  PDF {inr(PAYWALL_PDF)}
                </button>
                <button
                  onClick={() => onSelect("print")}
                  className="rounded-xl bg-brand-gradient py-2 text-sm font-bold text-white transition hover:opacity-90"
                >
                  Print {inr(PAYWALL_PRINT)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refine: re-roll this page's face (Diffrun "fine-tune") — free pages. */}
        {onRegenerate && !locked && page?.imageUrl && (
          <button
            onClick={() => onRegenerate(i + 1)}
            disabled={regeneratingPage != null}
            title="Not quite right? Regenerate this page"
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-deep shadow-md transition hover:bg-white disabled:opacity-60"
          >
            {regeneratingPage === i + 1 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Regenerate
          </button>
        )}

        {/* Controls — flip through the WHOLE book (free + locked teasers) */}
        <button
          onClick={() => go(-1)}
          disabled={i === 0}
          aria-label="Previous page"
          className="absolute left-3 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white disabled:opacity-0"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          onClick={() => go(1)}
          disabled={i === lastIndex}
          aria-label="Next page"
          className="absolute right-3 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-slate-deep shadow-md transition hover:bg-white disabled:opacity-0"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Counter + free/locked dots */}
      <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-mutedText">
        <span>
          Page {i + 1} of {total}
        </span>
        {locked && (
          <span className="inline-flex items-center gap-1 text-brand-primary">
            <Lock className="h-3.5 w-3.5" /> Locked
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {pages.map((p, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            aria-label={`Go to page ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              idx === i
                ? "w-5 bg-brand-primary"
                : idx >= freeCount
                  ? "w-1.5 bg-slate-300"
                  : "w-1.5 bg-brand-borderAccent"
            }`}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes flip {
          0% {
            transform: perspective(1200px) rotateY(0deg);
            opacity: 1;
          }
          50% {
            transform: perspective(1200px) rotateY(-18deg);
            opacity: 0.6;
          }
          100% {
            transform: perspective(1200px) rotateY(0deg);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
