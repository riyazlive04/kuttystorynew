"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Lock, Phone, RefreshCw } from "lucide-react";
import type { PreviewPage } from "@/lib/types";
import { inr } from "@/lib/format";
import { FORMAT_LABELS, PRICES, type Format } from "@/lib/pricing";

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
  isLoggedIn = false,
  onRequestLogin,
  onSelect,
  onRegenerate,
  regeneratingPage,
  placeholder,
}: {
  pages: PreviewPage[];
  freeCount: number;
  totalPages?: number;
  isLoggedIn?: boolean;
  onRequestLogin?: () => void;
  onSelect: (format: Format) => void;
  onRegenerate?: (pageNumber: number) => void;
  regeneratingPage?: number | null;
  /** Shown inside the page area while a free page has no image yet. The
   *  preview passes its progress panel here so the wait happens where the
   *  finished page will appear, rather than above it. */
  placeholder?: React.ReactNode;
}) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState<"none" | "next" | "prev">("none");
  const lastIndex = pages.length - 1;
  const page = pages[i];
  // Covers are real pages in the list, so a slot is no longer its page number.
  const covers = pages.filter((p) => p.kind && p.kind !== "story").length;
  const total = (totalPages ?? pages.length) + covers;
  // freeCount still wins (the preview passes pages.length once purchased); past
  // it, trust the page's own flag, falling back to slot math for older jobs.
  const isLocked = (p: PreviewPage | undefined, idx: number) =>
    idx < freeCount ? false : p?.kind ? !!p.locked : idx >= freeCount;
  const locked = isLocked(page, i);
  const label =
    page?.kind === "front_cover"
      ? "Front cover"
      : page?.kind === "back_cover"
        ? "Back cover"
        : `Page ${page?.pageNumber ?? i + 1} of ${total - covers}`;

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
              alt={locked ? `Locked — ${label}` : label}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className={locked ? "scale-110 object-cover blur-2xl" : "object-contain"}
            />
          ) : locked ? (
            // Locked page with no base-art teaser — decorative placeholder.
            <div className="h-full w-full bg-gradient-to-br from-brand-lilac/60 to-brand-borderAccent" />
          ) : (
            // Free page still rendering. The caller can put something more
            // substantial here; this is the fallback when it does not.
            (placeholder ?? (
              <div className="shimmer flex h-full w-full flex-col items-center justify-center gap-3">
                <Loader2 className="h-9 w-9 animate-spin text-brand-primary" />
                <span className="text-sm font-semibold text-slate-mutedText">
                  Creating this page…
                </span>
              </div>
            ))
          )}

          {/* The story text is already burned into the page image (authored
              position, matches the print PDF), so no separate caption overlay. */}
        </div>

        {/* Locked-page teaser: blurred art shows through; unlock CTA on top. */}
        {locked && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-between p-4">
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3.5 py-1.5 text-xs font-bold text-white shadow-md backdrop-blur">
              {!isLoggedIn ? (
                <>
                  <Phone className="h-3.5 w-3.5 text-amber-400" /> Sign In to Read Full Story
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-brand-purple" /> Purchase to Unlock
                </>
              )}
            </span>

            <div className="w-full max-w-sm rounded-3xl border border-brand-borderAccent bg-white/95 p-5 shadow-2xl backdrop-blur">
              {!isLoggedIn && onRequestLogin ? (
                <div className="text-center">
                  <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                    <Phone className="h-5 w-5" />
                  </span>
                  <p className="font-bold text-slate-deep text-base">
                    Read the Full Story Free
                  </p>
                  <p className="mt-1 text-xs text-slate-mutedText">
                    You&apos;ve read the first 3 preview pages! Sign in with your mobile number to unlock all {total - covers} pages.
                  </p>
                  <button
                    onClick={onRequestLogin}
                    className="btn-primary mt-4 w-full py-2.5 text-sm"
                  >
                    <Phone className="h-4 w-4" /> Sign In with Phone
                  </button>
                  <div className="my-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      or buy now
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="grid gap-2">
                    <button
                      onClick={() => onSelect("pdf")}
                      className="rounded-xl border-2 border-brand-primary/40 py-2 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                    >
                      {FORMAT_LABELS.pdf} {inr(PRICES.pdf)}
                    </button>
                    <button
                      onClick={() => onSelect("staple")}
                      className="rounded-xl border-2 border-brand-primary/40 py-2 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                    >
                      {FORMAT_LABELS.staple} {inr(PRICES.staple)}
                    </button>
                    <button
                      onClick={() => onSelect("print")}
                      className="rounded-xl bg-slate-800 py-2 text-xs font-bold text-white transition hover:bg-slate-900"
                    >
                      {FORMAT_LABELS.print} {inr(PRICES.print)}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-center text-sm font-semibold text-slate-deep">
                    Unlock all {total} personalized pages
                  </p>
                  <div className="mt-3 grid gap-2">
                    <button
                      onClick={() => onSelect("pdf")}
                      className="rounded-xl border-2 border-brand-primary py-2 text-sm font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                    >
                      {FORMAT_LABELS.pdf} {inr(PRICES.pdf)}
                    </button>
                    <button
                      onClick={() => onSelect("staple")}
                      className="rounded-xl border-2 border-brand-primary py-2 text-sm font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                    >
                      {FORMAT_LABELS.staple} {inr(PRICES.staple)}
                    </button>
                    <button
                      onClick={() => onSelect("print")}
                      className="rounded-xl bg-brand-gradient py-2 text-sm font-bold text-white transition hover:opacity-90"
                    >
                      {FORMAT_LABELS.print} {inr(PRICES.print)}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Refine: re-roll this page's face (Diffrun "fine-tune") — free pages. */}
        {onRegenerate && !locked && page?.imageUrl && (
          <button
            onClick={() => onRegenerate(page.pageNumber ?? i + 1)}
            disabled={regeneratingPage != null}
            title="Not quite right? Regenerate this page"
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-deep shadow-md transition hover:bg-white disabled:opacity-60"
          >
            {regeneratingPage === (page.pageNumber ?? i + 1) ? (
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
        <span>{label}</span>
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
            aria-label={
              p.kind === "front_cover"
                ? "Go to front cover"
                : p.kind === "back_cover"
                  ? "Go to back cover"
                  : `Go to page ${p.pageNumber ?? idx + 1}`
            }
            className={`h-1.5 rounded-full transition-all ${
              idx === i
                ? "w-5 bg-brand-primary"
                : isLocked(p, idx)
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
