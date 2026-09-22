"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Heart, Sparkles } from "lucide-react";

// How long a preview usually takes, end to end. Pages are painted at the same
// time, not one after another, so the server's own progress sits still for
// minutes and then jumps -- and a bar that doesn't move reads as "broken",
// which is when parents refresh, retry, or leave. The bar below moves on its
// own, eased against this, and is pulled forward whenever the server reports
// real progress.
const TYPICAL_SECONDS = 210;
// Past this, say plainly that it's taking longer — silence is what worries.
const SLOW_SECONDS = 360;
// The bar may drift up to here on time alone; only a finished page moves it
// further. It must never claim to be done before it is.
const DRIFT_CAP = 92;

type Status = "queued" | "processing" | "rendering" | string;

export function GenerationProgress({
  status,
  serverProgress,
  childName,
  pagesReady,
  pagesTotal,
}: {
  status: Status;
  serverProgress: number;
  childName: string;
  pagesReady: number;
  pagesTotal: number;
}) {
  const name = childName?.trim() || "your little one";
  const started = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  // The highest value ever shown. The bar only ever moves forward.
  const shown = useRef(3);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - started.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  const messages = [
    `Our illustrators are painting ${name} into every page ✨`,
    `Matching ${name}'s smile to each illustration…`,
    "Good things take a few minutes — this usually takes 3 to 5 minutes.",
    "Please keep this page open. We're still working, even when the bar is slow.",
    `Each page is made just for ${name} — no two books are ever the same.`,
    "Your preview is free. Nothing to pay until you love it.",
  ];

  useEffect(() => {
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % messages.length), 5500);
    return () => clearInterval(t);
  }, [messages.length]);

  // Time-based drift: fast at first, easing toward DRIFT_CAP, so a parent
  // always sees movement without being told it's nearly done when it isn't.
  const drift = 3 + (DRIFT_CAP - 3) * (1 - Math.exp(-elapsed / (TYPICAL_SECONDS * 0.55)));
  const target = Math.max(serverProgress || 0, Math.min(DRIFT_CAP, drift));
  shown.current = Math.max(shown.current, Math.min(99, target));
  const pct = Math.round(shown.current);

  const slow = elapsed > SLOW_SECONDS;
  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  // Where we are, in words a parent understands.
  const steps = [
    { label: "Photo received", done: true },
    {
      label: `Studying ${name}'s face`,
      done: status === "rendering" || pagesReady > 0,
      active: status === "queued" || status === "processing",
    },
    {
      label:
        pagesTotal > 0
          ? `Painting the pages (${pagesReady} of ${pagesTotal} ready)`
          : "Painting the pages",
      done: pagesTotal > 0 && pagesReady >= pagesTotal,
      active: status === "rendering" && pagesReady < pagesTotal,
    },
    {
      label: "Adding the finishing touches",
      done: false,
      active: pagesTotal > 0 && pagesReady >= pagesTotal,
    },
  ];

  return (
    <div
      className="mx-auto mb-8 max-w-lg rounded-3xl border-2 border-brand-borderAccent bg-white/80 p-6 text-center shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
        <Sparkles className="h-6 w-6 animate-pulse" />
      </div>
      <h2 className="text-lg font-bold text-slate-deep">
        Creating {name}&apos;s storybook
      </h2>

      {/* Rotating reassurance. Keyed so each message fades in fresh. */}
      <p
        key={msgIndex}
        className="mx-auto mt-1 min-h-[2.5rem] max-w-sm animate-fade-in text-sm text-slate-mutedText"
      >
        {messages[msgIndex]}
      </p>

      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-brand-borderAccent">
        <div
          className="relative h-full rounded-full bg-brand-gradient transition-[width] duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        >
          {/* A soft shimmer so the bar looks alive even between updates. */}
          <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{pct}%</span>
        <span>
          {mins}:{secs} elapsed · usually 3–5 min
        </span>
      </div>

      <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                s.done
                  ? "bg-emerald-500 text-white"
                  : s.active
                    ? "border-2 border-brand-primary"
                    : "border-2 border-slate-200"
              }`}
            >
              {s.done ? (
                <Check className="h-3 w-3" />
              ) : s.active ? (
                <span className="h-2 w-2 animate-ping rounded-full bg-brand-primary" />
              ) : null}
            </span>
            <span
              className={
                s.done
                  ? "text-slate-500"
                  : s.active
                    ? "font-semibold text-slate-deep"
                    : "text-slate-400"
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>

      {slow && (
        <p className="mt-5 rounded-2xl bg-brand-lilac/60 px-4 py-2.5 text-xs text-slate-deep">
          <Heart className="mr-1 inline h-3.5 w-3.5 text-brand-primary" />
          Our studio is extra busy right now, so this is taking a little longer
          than usual. It&apos;s still working — thank you for waiting!
        </p>
      )}
    </div>
  );
}
