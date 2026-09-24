"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Loader2, Lock, Phone, Sparkles } from "lucide-react";
import {
  approveJob,
  downloadFile,
  getConfig,
  getJob,
  previewPdfUrl,
  regeneratePage,
  retryJob,
} from "@/lib/api";
import { getStory } from "@/lib/data";
import { useCart } from "@/lib/cart";
import { jobIdFromParam, languageLabel, inr } from "@/lib/format";
import type { Format, Job } from "@/lib/types";
import { GenerationProgress } from "@/components/GenerationProgress";
import { FlipBook } from "@/components/FlipBook";
import { FORMAT_EMOJI, FORMAT_LABELS, PRICES, priceFor } from "@/lib/pricing";
import { trackCommerce, trackOnce } from "@/lib/analytics";
import { useCustomerAuth, formatIndianPhone } from "@/lib/auth";
import { PhoneLoginModal } from "@/components/PhoneLoginModal";

export default function PreviewPage({ params }: { params: { jobId: string } }) {
  // The URL segment is a readable slug ending in the real job id (…-<jobId>).
  const jobId = jobIdFromParam(params.jobId);
  const router = useRouter();
  const add = useCart((s) => s.add);
  const { customer, isLoggedIn } = useCustomerAuth();

  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [freePages, setFreePages] = useState(3);
  const [totalPages, setTotalPages] = useState(28);
  const [reloadKey, setReloadKey] = useState(0);
  const [regeneratingPage, setRegeneratingPage] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const GUEST_FREE_PAGES = 3;
  // If user is logged in with their phone number or purchased, they unlock all pages for preview
  const effectiveFreePages = job?.isPurchased || isLoggedIn ? totalPages : GUEST_FREE_PAGES;

  useEffect(() => {
    getConfig().then((c) => {
      setFreePages(c.freePreviewPages);
      setTotalPages(c.totalPages);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // Tolerate transient API failures (network blip / API restart) — keep polling
    // and only declare "not found" after sustained failure (~1 min) or a real 404.
    let failures = 0;
    const MAX_FAILURES = 30;
    async function tick() {
      try {
        const j = await getJob(jobId);
        if (cancelled) return;
        if (j === undefined) {
          setNotFound(true); // genuine 404 — the job no longer exists
          return;
        }
        failures = 0;
        setJob(j);
        // "failed" is settled too — polling it every second is what left the
        // customer watching "Creating page 1… 12%" spin forever.
        if (j.status !== "completed" && j.status !== "failed")
          timer = setTimeout(tick, 1000);
        else setRegeneratingPage(null); // render settled — clear refine spinner
      } catch {
        // Transient (fetch failed / 5xx while the API restarts). Back off & retry
        // so a brief blip doesn't freeze the progress bar mid-generation.
        if (cancelled) return;
        failures += 1;
        if (failures >= MAX_FAILURES) {
          setNotFound(true);
          return;
        }
        timer = setTimeout(tick, 2000);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, reloadKey]);

  // How the wait ended, and how long it took.
  //
  // This is the step that decides the business: the customer has already given
  // us a name and a photo, and everything after this point depends on a book
  // appearing. Whether it rendered, and how long they were made to wait for
  // it, is the difference between a sale and a silent exit — and neither is
  // visible in any page-view report.
  //
  // Timed from arriving on the page rather than from job creation, because
  // that is the wait they actually sit through. Reported once per job, so a
  // customer reopening a finished preview does not read as a second success.
  const waitStart = useRef(Date.now());

  useEffect(() => {
    if (!job) return;
    if (job.status !== "completed" && job.status !== "failed") return;
    trackOnce(
      `preview:${job.id}:${job.status}`,
      job.status === "completed" ? "preview_ready" : "preview_failed",
      {
        job_id: job.id,
        story_slug: job.storySlug,
        story_title: job.storyTitle,
        language: job.language,
        wait_seconds: Math.round((Date.now() - waitStart.current) / 1000),
      },
    );
  }, [job]);

  const [retrying, setRetrying] = useState(false);
  async function handleRetry() {
    setRetrying(true);
    const ok = await retryJob(jobId);
    setRetrying(false);
    if (ok) setReloadKey((k) => k + 1); // poll again while it resumes
    else alert("Couldn't restart the preview. Please try again in a minute.");
  }

  async function handleRegenerate(pageNumber: number) {
    setRegeneratingPage(pageNumber);
    const ok = await regeneratePage(jobId, pageNumber);
    if (!ok) {
      setRegeneratingPage(null);
      alert("Couldn't regenerate this page. Please try again.");
      return;
    }
    setReloadKey((k) => k + 1); // resume polling until the re-roll finishes
  }

  async function handleApprove() {
    setApproving(true);
    const ok = await approveJob(jobId);
    setApproving(false);
    if (ok) setReloadKey((k) => k + 1);
    else alert("Couldn't approve for print. Please try again.");
  }

  if (notFound) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-deep">Preview not found</h1>
        <p className="mt-2 text-slate-mutedText">
          This preview may have expired. Let&apos;s create a new one.
        </p>
        <Link href="/stories" className="btn-primary mt-6 inline-flex">
          Browse stories
        </Link>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container-x grid place-items-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  const story = getStory(job.storySlug);
  const failed = job.status === "failed";
  const rendering = job.status !== "completed" && !failed;
  // Page-by-page progress (Diffrun-style): count free pages already rendered so
  // we can show "Creating page N of M" — more tangible than an abstract %.
  const renderedFree = job.pages
    .slice(0, freePages)
    .filter((p) => p.imageUrl).length;

  function handleSelect(format: Format) {
    if (!job) return;
    // The child's own rendered front cover, when it exists — it is always the
    // right gender, which the catalog image only is for a single-variant book.
    const renderedCover = job.pages.find(
      (p) => p.kind === "front_cover" && p.imageUrl,
    )?.imageUrl;
    add({
      id: `${job.id}-${format}`,
      jobId: job.id,
      storySlug: job.storySlug,
      storyTitle: job.storyTitle,
      childName: job.childName,
      format,
      language: job.language,
      coverImage: renderedCover || story?.coverImage || job.pages[0]?.imageUrl || "",
      unitPrice: priceFor(format),
      quantity: 1,
    });
    // Which edition was picked. The format is the single biggest driver of
    // margin, so carrying it on the event is what lets the reports show the
    // mix rather than just the count.
    trackCommerce("add_to_cart", {
      lines: [
        {
          storySlug: job.storySlug,
          storyTitle: job.storyTitle,
          quantity: 1,
          unitPrice: priceFor(format),
          format,
          language: job.language,
        },
      ],
      value: priceFor(format),
    });
    router.push("/checkout");
  }

  return (
    <div className="container-x py-10">
      <div className="mb-8 text-center">
        <span className="chip bg-brand-borderAccent text-brand-primaryDark">
          <Sparkles className="h-3.5 w-3.5" /> Story preview
        </span>
        <h1 className="mt-3 text-3xl font-bold text-slate-deep md:text-4xl">
          {job.childName}&apos;s{" "}
          <span className="text-brand-primary">{job.storyTitle}</span>
        </h1>

        {/* Login status banner */}
        {isLoggedIn ? (
          <div className="mt-2.5 flex flex-col items-center gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Full preview unlocked for {formatIndianPhone(customer?.phone || "")}
            </span>
            <p className="text-xs text-slate-mutedText">
              Flip through all {totalPages} personalized pages below
            </p>
          </div>
        ) : (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <p className="text-sm text-slate-mutedText">
              {languageLabel(job.language)} · Reading pages 1–{GUEST_FREE_PAGES} free
            </p>
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/40 bg-brand-lilac/70 px-3.5 py-1 text-xs font-bold text-brand-primaryDark shadow-xs transition hover:bg-brand-lilac"
            >
              <Phone className="h-3.5 w-3.5 text-brand-primary" />
              Sign in with mobile number to read all {totalPages} pages free
            </button>
          </div>
        )}

        {/* Pay-to-Download Gate (no free download allowed) */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => handleSelect("pdf")}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 active:scale-95"
          >
            <Lock className="h-4 w-4" />
            {FORMAT_EMOJI.pdf} {FORMAT_LABELS.pdf} ({inr(PRICES.pdf)})
          </button>
          <button
            onClick={() => handleSelect("staple")}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 active:scale-95"
          >
            {FORMAT_EMOJI.staple} {FORMAT_LABELS.staple} ({inr(PRICES.staple)})
          </button>
          <button
            onClick={() => handleSelect("print")}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-105 active:scale-95"
          >
            {FORMAT_EMOJI.print} {FORMAT_LABELS.print} ({inr(PRICES.print)})
          </button>
        </div>
      </div>

      {failed && (
        <div className="mx-auto mb-8 max-w-md rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 text-center">
          <p className="font-bold text-slate-deep">
            Our illustrators are extra busy right now
          </p>
          <p className="mt-1 text-sm text-slate-mutedText">
            We couldn&apos;t finish {job.childName}&apos;s preview this time. Nothing
            is lost — tap below and we&apos;ll pick up where we left off.
          </p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn-primary mt-4 inline-flex items-center gap-2 disabled:opacity-60"
          >
            {retrying && <Loader2 className="h-4 w-4 animate-spin" />}
            Try again
          </button>
        </div>
      )}

      {/* The wait lives inside the book, not above it. Two stacked panels meant
          the progress filled the screen and the page it was producing appeared
          below the fold — so the moment it arrived was the moment nobody saw.
          One section: the same square holds the wait and then the page. */}
      <FlipBook
        pages={job.pages}
        freeCount={effectiveFreePages}
        totalPages={totalPages}
        isLoggedIn={isLoggedIn}
        onRequestLogin={() => setShowLoginModal(true)}
        onSelect={handleSelect}
        onRegenerate={job.status === "completed" ? handleRegenerate : undefined}
        regeneratingPage={regeneratingPage}
        placeholder={
          rendering ? (
            <GenerationProgress
              status={job.status}
              serverProgress={job.progress}
              childName={job.childName}
              pagesReady={renderedFree}
              pagesTotal={effectiveFreePages}
              variant="inline"
            />
          ) : undefined
        }
      />

      <PhoneLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        title="Unlock All Story Pages"
        subtitle={`Enter your mobile number to read all ${totalPages} pages of ${job.childName}'s personalized storybook.`}
      />

      {/* Purchased: approve-for-print gate (Diffrun). */}
      {job.isPurchased && (
        <div className="mx-auto mt-8 max-w-lg rounded-3xl border-2 border-brand-borderAccent bg-white p-6 text-center shadow-sm">
          {job.printApproved ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <h3 className="text-lg font-bold text-slate-deep">
                Approved for print 🎉
              </h3>
              <p className="text-sm text-slate-mutedText">
                Your book is in the production queue. We&apos;ll email you tracking
                once it ships.
              </p>
              {job.pdfDownloadUrl && (
                <a
                  href={job.pdfDownloadUrl}
                  className="btn-primary mt-2 inline-flex"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF
                </a>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <h3 className="text-lg font-bold text-slate-deep">
                Happy with every page?
              </h3>
              <p className="text-sm text-slate-mutedText">
                Use <span className="font-semibold">Regenerate</span> on any page
                you want to refine. When it&apos;s perfect, approve it for print.
              </p>
              <button
                onClick={handleApprove}
                disabled={approving || job.status !== "completed"}
                className="btn-primary inline-flex disabled:opacity-60"
              >
                {approving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" /> Approve for print
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {!job.isPurchased && (
        <p className="mx-auto mt-6 max-w-md text-center text-xs text-slate-mutedText">
          {isLoggedIn
            ? `You're viewing all ${totalPages} personalized pages. Pay to download or print your copy.`
            : `Turn the pages to read the first ${freePages} free. Sign in with your phone to unlock all ${totalPages} pages — then pay to download.`
          }
        </p>
      )}
    </div>
  );
}
