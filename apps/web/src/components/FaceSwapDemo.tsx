"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { FaceDemo } from "@/lib/faceDemo";

/** How long each child holds, and how long the cross-fade takes. The photo in
 *  the corner changes on the same beat as the art, because the point being made
 *  is that one produced the other. */
const HOLD_MS = 2800;
const FADE_MS = 600;

/**
 * A book's cover with a real child's face swapped into it, cycling through a
 * few children -- with the PHOTO each face came from shown in the corner and an
 * arrow drawn into the illustrated face.
 *
 * Every frame is a pre-rendered output of the production face-swap, run against
 * the live cover art, so this demonstrates the product rather than illustrating
 * it. The loop returns to the untouched art between children: the swap is only
 * legible if you have seen what was there before.
 *
 * `compact` is the grid version -- one child instead of three, so a page of
 * twenty cards pulls three images per card and not seven. Cards also animate
 * ONLY while on screen, and start on a stagger, so a grid reads as a page of
 * books rather than a wall of things flashing in unison.
 *
 * Reduced motion is honoured by not animating: one personalised frame, held.
 */
export function FaceSwapDemo({
  demo,
  title,
  compact = false,
  stagger = 0,
  className = "",
}: {
  demo: FaceDemo;
  title: string;
  compact?: boolean;
  /** Index in a grid; shifts this card's phase so neighbours do not sync. */
  stagger?: number;
  className?: string;
}) {
  // A card shows ONE child, chosen by its position in the grid: three cards in
  // a row showing the same face reads as a stock photo, three different faces
  // reads as what the product does.
  const frames =
    compact && demo.frames.length
      ? [demo.frames[stagger % demo.frames.length]]
      : demo.frames;
  const total = frames.length + 1; // frame 0 is the untouched art
  const [frame, setFrame] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(!compact);
  const paused = useRef(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(1);
      return;
    }
    setAnimate(true);
  }, []);

  // Cards off screen do not animate -- and do not decode their frames either,
  // since an <Image> that is never shown stays lazy.
  useEffect(() => {
    if (!compact) return;
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => setVisible(e.isIntersecting),
      { rootMargin: "100px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [compact]);

  useEffect(() => {
    if (!animate || !visible) return;
    // Neighbours must not flip together. An offset on the FIRST tick alone does
    // not achieve that: a shared period puts every card back in step within a
    // cycle or two (a grid of cards, all offset, still turned over as one). So
    // the period itself varies by position, and each card starts its interval
    // only after its own offset has elapsed.
    const hold = (compact ? HOLD_MS + 400 : HOLD_MS) + (stagger % 4) * 260;
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      if (!paused.current) setFrame((f) => (f + 1) % total);
    };
    const kickoff = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, hold);
      },
      (stagger % 5) * 640 + 400,
    );
    return () => {
      clearTimeout(kickoff);
      if (interval) clearInterval(interval);
    };
  }, [animate, visible, total, compact, stagger]);

  const current = frame === 0 ? null : frames[frame - 1];
  // The pill fades out over FADE_MS when the art returns to the base plate. Its
  // text must not change while it is still on screen, or a card flashes the
  // placeholder on its way out -- so the last name is held through the fade.
  const [heldName, setHeldName] = useState("");
  useEffect(() => {
    if (current) setHeldName(`${current.child}'s copy`);
  }, [current]);
  const { x, y, w, h } = demo.face;
  // The photo sits in the lower-left; the arrow runs up out of it and down into
  // the lower-left of the face. Percentages, so the geometry survives every
  // size the cover is rendered at.
  //
  // There used to be a ring drawn around the face as well. A ring has to fit
  // the head to look deliberate, and one box per cover cannot do that across
  // art where heads differ in size and angle -- on several titles it sat off
  // the head entirely. The arrow points at the face without claiming to
  // outline it, so the box only has to be roughly right.
  const r = compact ? 13 : 11;
  const photo = { cx: compact ? 17 : 15, cy: compact ? 76 : 78, r };
  const from = { x: photo.cx + r * 0.35, y: photo.cy - r };
  const to = { x: x - w * 0.3, y: y + h * 0.33 };
  // Both control points above the line: straddling it drew an S that doubled
  // back instead of one sweep.
  const arrow = `M ${from.x} ${from.y} C ${from.x - 2} ${from.y - 12}, ${to.x - 8} ${to.y - 9}, ${to.x} ${to.y}`;
  const markerId = `fsd-${demo.base.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <div
      ref={host}
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
        priority={!compact}
        sizes={
          compact
            ? "(max-width: 768px) 100vw, 384px"
            : "(max-width: 1024px) 100vw, 600px"
        }
        className="object-cover"
      />

      {frames.map((f, i) => (
        <Image
          key={f.src}
          src={f.src}
          alt={`${title} personalised with ${f.child}'s face on the cover`}
          fill
          sizes={
            compact
              ? "(max-width: 768px) 100vw, 384px"
              : "(max-width: 1024px) 100vw, 600px"
          }
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
        style={{ transitionDuration: `${FADE_MS}ms`, opacity: current ? 1 : 0 }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <marker
              id={markerId}
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
            markerEnd={`url(#${markerId})`}
            // Keeps an even weight despite the non-uniform viewBox scaling that
            // preserveAspectRatio="none" implies.
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 1px 2px rgba(15,23,42,0.55))" }}
          />
        </svg>

        {frames.map((f, i) => (
          <div
            key={f.photo}
            className="absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-[3px] border-white shadow-lg transition-opacity"
            style={{
              left: `${photo.cx}%`,
              top: `${photo.cy}%`,
              width: `${r * 2}%`,
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
      </div>

      {/* Whose copy this is. The name is the payload of the animation, not a
          decoration -- same book, different child. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-slate-900/75 font-bold text-white backdrop-blur-sm transition-opacity ${
            compact ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
          } ${compact && !current ? "opacity-0" : "opacity-100"}`}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        >
          {current
            ? `${current.child}'s copy`
            : compact
              ? heldName
              : "Your child's face goes here"}
        </span>
      </div>
    </div>
  );
}
