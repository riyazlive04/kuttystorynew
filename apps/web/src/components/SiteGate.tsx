"use client";

import { useState, type FormEvent } from "react";

import { UNLOCK_PATH } from "@/lib/site-gate";

/**
 * The "under construction" popup.
 *
 * What sits behind the blur is a DECORATIVE stand-in, not the real site. The
 * middleware never sends real page content to an unauthenticated browser, so
 * there is nothing here to recover by deleting the overlay in devtools.
 */
export default function SiteGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(UNLOCK_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Hard reload, not router.refresh(): the gate decision happens in
        // middleware per request, so the page must be re-fetched with the
        // freshly set cookie.
        window.location.reload();
        return;
      }

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Something went wrong. Please try again.");
      setBusy(false);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-cream">
      {/* Blurred stand-in for the storefront behind the popup. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 select-none blur-lg">
        <div className="mx-auto w-full max-w-6xl px-8">
          <div className="mt-8 flex items-center justify-between">
            <div className="h-9 w-40 rounded-2xl bg-brand-gradient opacity-80" />
            <div className="hidden gap-3 md:flex">
              {[64, 80, 56, 72].map((w) => (
                <div key={w} className="h-9 rounded-xl bg-brand-lilac" style={{ width: w }} />
              ))}
            </div>
            <div className="h-11 w-32 rounded-2xl bg-brand-gradient" />
          </div>

          <div className="mt-16 grid gap-10 md:grid-cols-2">
            <div className="space-y-5">
              <div className="h-14 w-full rounded-2xl bg-brand-lilac" />
              <div className="h-14 w-4/5 rounded-2xl bg-brand-lilac" />
              <div className="h-5 w-full rounded-xl bg-brand-borderAccent" />
              <div className="h-5 w-3/4 rounded-xl bg-brand-borderAccent" />
              <div className="h-12 w-52 rounded-2xl bg-brand-gradient" />
            </div>
            <div className="h-72 rounded-4xl bg-brand-gradient opacity-70" />
          </div>

          <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
            {["a", "b", "c", "d"].map((k) => (
              <div key={k} className="h-52 rounded-3xl border-2 border-brand-borderAccent bg-white">
                <div className="m-4 h-28 rounded-2xl bg-brand-peach opacity-70" />
                <div className="mx-4 h-4 rounded-lg bg-brand-lilac" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Brand colour wash over the top of it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-magenta/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-brand-purple/25 blur-3xl" />
      </div>

      {/* The popup itself. */}
      <div className="relative z-10 flex min-h-screen items-center justify-center bg-white/40 p-5 backdrop-blur-md">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-gate-title"
          className="w-full max-w-md rounded-4xl border-2 border-brand-borderAccent bg-white p-9 text-center shadow-glow"
        >
          <div className="text-gradient-brand text-base font-extrabold tracking-wide">KuttyStory</div>

          <div className="mt-5 text-5xl" role="img" aria-label="Under construction">
            🚧
          </div>

          <h1 id="site-gate-title" className="kids mt-4 text-2xl font-extrabold text-slate-deep">
            Site under construction
          </h1>
          <p className="mt-3 text-[0.95rem] leading-relaxed text-slate-mutedText">
            We&apos;re putting the finishing touches on KuttyStory. If you have the
            access password, enter it below to view the site.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-3 text-left">
            <label htmlFor="site-gate-password" className="sr-only">
              Access password
            </label>
            <input
              id="site-gate-password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "site-gate-error" : undefined}
              className="w-full rounded-2xl border-2 border-brand-borderAccent bg-brand-cream px-5 py-3.5 text-center text-slate-deep outline-none transition placeholder:text-slate-mutedText focus:border-brand-primary"
            />

            {error ? (
              <p id="site-gate-error" role="alert" className="px-1 text-sm font-semibold text-brand-pinkDeep">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Checking…" : "Unlock site"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
