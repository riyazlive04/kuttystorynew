"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { adminApi, type AdminJob } from "@/lib/admin";
import { previewPdfUrl } from "@/lib/api";
import { previewPath } from "@/lib/format";

type Filter = "all" | "purchased";

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

  useEffect(() => {
    setLoading(true);
    adminApi
      .jobs(filter === "purchased" ? true : undefined)
      .then(setJobs)
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [filter]);

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
                    {j.renderedFreePages} free
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
    </div>
  );
}
