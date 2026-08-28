"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  adminApi,
  VARIANTS,
  type AdminJob,
  type AdminStory,
  type Variant,
} from "@/lib/admin";
import { previewPdfUrl } from "@/lib/api";
import { previewPath } from "@/lib/format";

type Filter = "all" | "purchased";

// Enough to scan without scrolling, few enough that a page is one quick query.
const PAGE_SIZE = 25;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminPreviews() {
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [showTest, setShowTest] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  // The spinner belongs to a load the admin ASKED for -- first paint, or a
  // different filter. The poll below reuses this same effect, and setting
  // `loading` there too was replacing the whole table with a spinner every five
  // seconds for as long as anything was rendering. That is the flicker: not a
  // reload, just this component throwing its own rows away and putting them
  // back. A background refresh now swaps the data underneath without disturbing
  // what is on screen.
  useEffect(() => {
    setLoading(true);
  }, [filter, page]);

  // A different filter is a different result set, so page 3 of the old one is
  // not a meaningful place to land -- and if it is past the end of the new one,
  // the table would come back empty and look broken.
  useEffect(() => {
    setPage(0);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .jobs(filter === "purchased" ? true : undefined, page * PAGE_SIZE, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setJobs(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, refresh, page]);

  // A render in flight on the page being looked at? Poll so progress ticks
  // without a manual reload. Deliberately scoped to the visible rows: polling
  // because something is rendering on page 7 would query forever for a number
  // nobody is watching.
  useEffect(() => {
    if (!jobs.some((j) => j.status === "queued" || j.status === "rendering" || j.status === "processing"))
      return;
    const t = setTimeout(() => setRefresh((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [jobs]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-deep">Previews</h1>
          <p className="text-sm text-slate-mutedText">
            Every generated preview session. Download the free-preview PDF for any
            of them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTest(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-bold text-white"
          >
            <Sparkles className="h-4 w-4" /> Test render a book
          </button>
          {(["all", "purchased"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-3 py-2 text-sm font-bold capitalize transition ${
                filter === f
                  ? "bg-brand-primary text-white"
                  : "border-2 border-brand-borderAccent text-slate-mutedText hover:border-brand-primary"
              }`}
            >
              {f === "all" ? "All" : "Purchased"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-8 text-center text-slate-mutedText">
          No previews found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-borderAccent text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pr-4 font-bold">Child</th>
                <th className="py-3 pr-4 font-bold">Story</th>
                <th className="py-3 pr-4 font-bold">Status</th>
                <th className="py-3 pr-4 font-bold">Pages</th>
                <th className="py-3 pr-4 font-bold">Created</th>
                <th className="py-3 pr-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-brand-lilac/30"
                >
                  <td className="py-3 pr-4 font-bold text-slate-deep">
                    {j.childName || "—"}
                    {j.isPurchased && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                        Paid
                      </span>
                    )}
                    {j.isTest && (
                      <span className="ml-2 rounded-full bg-brand-lilac px-2 py-0.5 text-[10px] font-bold uppercase text-brand-primaryDark">
                        Test
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-mutedText">{j.storyTitle}</td>
                  <td className="py-3 pr-4">
                    <span className="font-semibold capitalize text-slate-deep">
                      {j.status}
                    </span>
                    {j.status !== "completed" && (
                      <span className="text-slate-400"> · {j.progress}%</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-mutedText">
                    {j.renderedFreePages} {j.isTest ? "pages" : "free"}
                  </td>
                  <td className="py-3 pr-4 text-slate-mutedText">
                    {fmtDate(j.createdAt)}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {j.previewReady && !j.purged ? (
                        <a
                          href={previewPdfUrl(j.id)}
                          target="_blank"
                          rel="noreferrer"
                          title="Download the generated preview PDF"
                          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-brand-primary px-2.5 py-1 text-xs font-bold text-brand-primary transition hover:bg-brand-primary hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {j.purged ? "purged" : "not ready"}
                        </span>
                      )}
                      <Link
                        href={previewPath(j.id, j.childName, j.storyTitle)}
                        target="_blank"
                        title="Open the preview page"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-brand-borderAccent px-2.5 py-1 text-xs font-bold text-slate-mutedText transition hover:border-brand-primary hover:text-brand-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-mutedText">
            Showing <span className="font-bold text-slate-deep">{from}</span>–
            <span className="font-bold text-slate-deep">{to}</span> of{" "}
            <span className="font-bold text-slate-deep">{total}</span>
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((n) => Math.max(0, n - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-brand-borderAccent px-3 py-2 text-sm font-bold text-slate-deep transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="px-1 text-sm font-semibold text-slate-mutedText">
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((n) => Math.min(pageCount - 1, n + 1))}
                disabled={page >= pageCount - 1}
                className="inline-flex items-center gap-1 rounded-xl border-2 border-brand-borderAccent px-3 py-2 text-sm font-bold text-slate-deep transition hover:border-brand-primary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {showTest && (
        <TestRenderModal
          onClose={() => setShowTest(false)}
          onStarted={() => {
            setShowTest(false);
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

// Renders a whole book end to end for review — every page, nothing paywalled,
// through the same pipeline a customer's order uses.
function TestRenderModal({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  onStarted: () => void;
}) {
  const [stories, setStories] = useState<AdminStory[]>([]);
  const [slug, setSlug] = useState("");
  const [childName, setChildName] = useState("Aarav");
  const [gender, setGender] = useState<Variant>("boy");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stories()
      .then((s) => {
        setStories(s);
        if (s[0]) setSlug(s[0].slug);
      })
      .catch(() => {});
  }, []);

  const story = stories.find((s) => s.slug === slug);
  // A gender-locked book can only be rendered for that gender.
  const allowed = story?.genderLock ? [story.genderLock] : VARIANTS;
  useEffect(() => {
    if (!allowed.includes(gender)) setGender(allowed[0]);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminApi.upload(file);
      setPhotoUrl(url);
    } catch {
      setError("Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    if (!slug) return;
    setError(null);
    setBusy(true);
    try {
      const r = await adminApi.testRender({
        storySlug: slug,
        childName: childName.trim() || "Aarav",
        gender,
        photoUrl: photoUrl || undefined,
      });
      alert(
        `Rendering ${r.pages} ${r.variant} pages plus covers in the background. ` +
          `Watch the progress in this list, then hit View to page through it.`,
      );
      onStarted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the render");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div className="card w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-slate-deep">Test render a book</h2>
        <p className="mt-1 text-sm text-slate-mutedText">
          Renders the book <b>exactly as a customer would get it</b> — the pages
          you have already authored, with a face swapped in and the text burned
          on — but every page, with nothing behind the paywall. Nothing you have
          written is changed. Costs one render per page.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-deep">
              Book
            </span>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-xl border-2 border-brand-borderAccent px-3 py-2 text-sm outline-none focus:border-brand-primary"
            >
              {stories.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-deep">
                Child&apos;s name
              </span>
              <input
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                className="w-full rounded-xl border-2 border-brand-borderAccent px-3 py-2 text-sm outline-none focus:border-brand-primary"
              />
            </label>
            <div>
              <span className="mb-1 block text-sm font-semibold text-slate-deep">
                Character
              </span>
              <div className="grid grid-cols-2 gap-2">
                {allowed.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`rounded-xl border-2 py-2 text-sm font-semibold capitalize transition ${
                      gender === g
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primaryDark"
                        : "border-slate-200 text-slate-mutedText"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-deep">
              Test photo
            </span>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {photoUrl ? "Replace photo" : "Upload a child's photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={pickPhoto}
                />
              </label>
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt="test face"
                  className="h-12 w-12 rounded-lg object-cover"
                />
              )}
            </div>
            <p className="mt-1 text-xs text-slate-mutedText">
              Without a photo the pages still render, but no face is swapped in —
              so upload one to check the result a customer would actually get.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm font-semibold text-red-500">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border-2 border-brand-borderAccent px-4 py-2 text-sm font-bold text-slate-deep"
          >
            Cancel
          </button>
          <button onClick={start} disabled={busy || !slug} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start render"}
          </button>
        </div>
      </div>
    </div>
  );
}
