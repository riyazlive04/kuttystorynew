"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { FaceDemo } from "@/lib/faceDemo";

/** How long each child holds on screen, and how long the cross-fade takes.
 *  The photo in the corner changes on the same beat as the art, because the
 *  point being made is that one caused the other. */
const HOLD_MS = 2800;
const FADE_MS = 600;

/**
 * The book's cover with a real child's face swapped into it, cycling through a
 * few children -- with the PHOTO each face came from shown in the corner and an
 * arrow drawn from it into the illustrated face.
 *
 * Every frame is a pre-rendered output of the production face-swap, run against
 * the live cover art, so this demonstrates the product rather than illustrating
 * it. The loop returns to the untouched art between children: the swap is only
 * legible if you have seen what was there before.
 *
 * Reduced motion is honoured by not animating: one personalised frame, held.
 * An autoplaying loop over a face is what that setting exists to stop.
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
  const total = demo.frames.length + 1;
  const [frame, setFrame] = useState(0);
  const [animate, setAnimate] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(1);
      return;
    }
    setAnimate(true);
  }, []);

  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => {
      if (!paused.current) setFrame((f) => (f + 1) % total);
    }, HOLD_MS);
    return () => clearInterval(t);
  }, [animate, total]);

  const current = frame === 0 ? null : demo.frames[frame - 1];
  const { x, y, w, h } = demo.face;
  // The photo sits in the lower-left; the arrow runs from its top edge up to
  // the chin of the illustrated face. Both in % of the frame, so the geometry
  // survives every size the cover is rendered at.
  const photo = { cx: 15, cy: 78, r: 11 };
  // Up out of the photo, over, and down into the lower-left of the face: one
  // smooth arc whose tangent at the end aims INTO the face, so the arrowhead
  // (oriented off that tangent) points where it should. Both control points
  // sit above the line for a single sweep -- straddling it drew an S that
  // doubled back on itself.
  const from = { x: photo.cx + photo.r * 0.35, y: photo.cy - photo.r };
  const to = { x: x - w * 0.3, y: y + h * 0.33 };
  const arrow = `M ${from.x} ${from.y} C ${from.x - 2} ${from.y - 12}, ${to.x - 8} ${to.y - 9}, ${to.x} ${to.y}`;

  return (
    <div
      className={`relative h-full w-full ${className}`}
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      {/* The base plate stays mounted underneath: every swapped frame is the
          same artwork, so cross-fading over it keeps the page from flashing
          between children. */}
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
          style={{ transitionDuration: `${FADE_MS}ms` }}
          className={`object-cover transition-opacity ease-in-out ${
            frame === i + 1 ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* The photo this face came from, and the arrow that says so. Hidden on
          the base frame, where there is no photo to point at yet. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity"
        style={{
          transitionDuration: `${FADE_MS}ms`,
          opacity: current ? 1 : 0,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="fsd-arrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 8 5 L 0 9 z" fill="#ffffff" />
            </marker>
          </defs>
          <path
            d={arrow}
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            markerEnd="url(#fsd-arrow)"
            // vectorEffect keeps the stroke an even weight despite the
            // non-uniform viewBox scaling this preserveAspectRatio implies.
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 1px 2px rgba(15,23,42,0.55))" }}
          />
        </svg>

        {demo.frames.map((f, i) => (
          <div
            key={f.photo}
            className="absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-[3px] border-white shadow-lg transition-opacity"
            style={{
              left: `${photo.cx}%`,
              top: `${photo.cy}%`,
              width: `${photo.r * 2}%`,
              aspectRatio: "1",
              transitionDuration: `${FADE_MS}ms`,
              opacity: frame === i + 1 ? 1 : 0,
            }}
          >
            <Image
              src={f.photo}
              alt={`The photo ${f.child}'s parents uploaded`}
              fill
              sizes="140px"
              className="object-cover"
            />
          </div>
        ))}

        {/* A soft ring on the face the swap landed on, so the eye is in the
            right place when the child changes. */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[50%] ring-[3px] ring-white/80 shadow-[0_0_30px_6px_rgba(255,255,255,0.22)]"
          style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
        />
      </div>

      {/* Whose copy this is. The name is the payload of the animation, not a
          decoration -- same book, different child. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/75 px-3.5 py-1.5 text-sm font-bold text-white backdrop-blur-sm transition-opacity"
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          {current ? `${current.child}'s copy` : "Your child's face goes here"}
        </span>
      </div>
    </div>
  );
}
