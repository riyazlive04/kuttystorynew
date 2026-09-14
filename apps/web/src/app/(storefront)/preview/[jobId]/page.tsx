"use client";

import { useEffect, useState } from "react";
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
} from "@/lib/api";
import { getStory } from "@/lib/data";
import { useCart } from "@/lib/cart";
import { jobIdFromParam, languageLabel, inr } from "@/lib/format";
import type { Format, Job } from "@/lib/types";
import { FlipBook } from "@/components/FlipBook";
import { PAYWALL_PDF, PAYWALL_PRINT } from "@/components/Paywall";
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
        if (j.status !== "completed") timer = setTimeout(tick, 1000);
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
  const rendering = job.status !== "completed";
  // Page-by-page progress (Diffrun-style): count free pages already rendered so
  // we can show "Creating page N of M" — more tangible than an abstract %.
  const renderedFree = job.pages
    .slice(0, freePages)
    .filter((p) => p.imageUrl).length;
  const currentPage = Math.min(renderedFree + 1, freePages);

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
      unitPrice: format === "pdf" ? PAYWALL_PDF : PAYWALL_PRINT,
      quantity: 1,
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
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white shadow-glow transition hover:brightness-105 active:scale-95"
          >
            <Lock className="h-4 w-4" />
            Pay to Download Copy ({inr(PAYWALL_PDF)})
          </button>
          <button
            onClick={() => handleSelect("print")}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-800 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 active:scale-95"
          >
            Order Hardcover Print ({inr(PAYWALL_PRINT)})
          </button>
        </div>
      </div>

      {rendering && (
        <div className="mx-auto mb-8 max-w-md text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-deep">
            <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
            {job.status === "queued" && "Warming up the studio…"}
            {job.status === "processing" && "Bringing your hero to life…"}
            {job.status === "rendering" &&
              `Creating page ${currentPage} of ${effectiveFreePages}…`}
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-borderAccent">
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-700"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">{job.progress}%</p>
        </div>
      )}

      <FlipBook
        pages={job.pages}
        freeCount={effectiveFreePages}
        totalPages={totalPages}
        isLoggedIn={isLoggedIn}
        onRequestLogin={() => setShowLoginModal(true)}
        onSelect={handleSelect}
        onRegenerate={job.status === "completed" ? handleRegenerate : undefined}
        regeneratingPage={regeneratingPage}
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
