"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { FaceDemo } from "@/lib/faceDemo";

/** How long each child stays on screen, and how long the sweep across the face
 *  takes. The sweep runs at the END of a hold, so it reads as the cause of the
 *  change rather than something that happens after it. */
const HOLD_MS = 2600;
const SWEEP_MS = 900;
/** Matches the frames' `duration-500` cross-fade. */
const FADE_MS = 500;

/**
 * The book's cover with a real child's face swapped into it, cycling through a
 * few children.
 *
 * Every frame is a pre-rendered output of the production face-swap, so this is
 * a demonstration and not an illustration of one. The base plate is frame zero:
 * the loop always returns to the un-personalised art, which is what makes the
 * swap legible -- a parent sees the drawn child become their child.
 *
 * Reduced motion is honoured by not animating at all: one personalised frame is
 * shown, statically. An autoplaying loop over a face is exactly the kind of
 * movement that setting exists to stop.
 */
export function FaceSwapDemo({
  demo,
  title,
  className = "",
}: {
  demo: FaceDemo;
  title: string;
  className?: string;
}) {
  // Frame 0 is the base art; 1..n are the swapped children.
  const [frame, setFrame] = useState(0);
  const [sweeping, setSweeping] = useState(false);
  const [animate, setAnimate] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setFrame(1); // show a personalised cover and stop there
      return;
    }
    setAnimate(true);
  }, []);

  useEffect(() => {
    if (!animate) return;
    const total = demo.frames.length + 1;
    let sweepTimer: ReturnType<typeof setTimeout>;
    const tick = setInterval(() => {
      if (paused.current) return;
      // Sweep first, change the face under it, then let the sweep finish.
      setSweeping(true);
      sweepTimer = setTimeout(() => {
        setFrame((f) => (f + 1) % total);
        // Held until the cross-fade has finished, not just until the sweep has:
        // the name below is swapped with the frame, so releasing it early shows
        // the incoming child's name over the outgoing child's face.
        setTimeout(() => setSweeping(false), FADE_MS + 60);
      }, SWEEP_MS / 2);
    }, HOLD_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(sweepTimer);
    };
  }, [animate, demo.frames.length]);

  const current = frame === 0 ? null : demo.frames[frame - 1];
  const face = demo.face;

  return (
    <div
      className={`relative h-full w-full ${className}`}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      {/* The base plate is always mounted underneath: every swapped frame is
          the same artwork, so cross-fading over a stable base keeps the page
          from flashing white between children. */}
      <Image
        src={demo.base}
        alt={`${title} - the illustrated cover before personalisation`}
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 600px"
        className="object-cover"
      />

      {demo.frames.map((f, i) => (
        <Image
          key={f.src}
          src={f.src}
          alt={`${title} personalised with ${f.child}'s face on the cover`}
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className={`object-cover transition-opacity duration-500 ease-in-out ${
            frame === i + 1 ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* The face the swap lands on: a soft ring that pulses as the sweep
          passes, so the eye is already in the right place when it changes. */}
      <div
        className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-[50%] ring-2 transition-all duration-500 ${
          sweeping
            ? "ring-white/70 shadow-[0_0_36px_10px_rgba(255,255,255,0.32)]"
            : "ring-white/0"
        }`}
        style={{
          left: `${face.x}%`,
          top: `${face.y}%`,
          width: `${face.w}%`,
          height: `${face.h}%`,
        }}
      />

      {/* The scan: a bright band that crosses the face as the child changes. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={`absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent ${
            sweeping ? "face-sweep" : "opacity-0"
          }`}
        />
      </div>

      {/* Whose copy this is. Reads as the point of the animation rather than a
          decoration: the cover is the same book, the child is not. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3.5 py-1.5 text-sm font-bold text-white backdrop-blur-sm transition-opacity duration-300 ${
            sweeping ? "opacity-0" : "opacity-100"
          }`}
        >
          <Sparkles className="h-4 w-4 text-amber-300" />
          {current ? `${current.child}'s copy` : "Your child goes here"}
        </span>
      </div>

      <style jsx>{`
        .face-sweep {
          animation: face-sweep ${SWEEP_MS}ms ease-in-out;
        }
        @keyframes face-sweep {
          from {
            transform: translateX(-120%);
            opacity: 0;
          }
          35% {
            opacity: 1;
          }
          to {
            transform: translateX(420%);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
