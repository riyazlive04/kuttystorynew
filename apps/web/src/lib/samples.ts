import type { Story } from "./types";

/**
 * The artwork the homepage shows off — the hero slideshow and the "See the
 * magic" carousel.
 *
 * Derived from the live catalogue, never from a hand-written list: `getStories()`
 * returns only books the admin has published, so unpublishing a book takes its
 * pages off the homepage on the next revalidate. Each book contributes its own
 * interior page art (`samplePages`, authored in the Page Editor), falling back
 * to its gallery and finally to its cover, so a book with no interior pages
 * authored yet still shows something real.
 */
export type Sample = { src: string; alt: string };

export type StorySamples = {
  title: string;
  /** Links the card to /stories/<slug>. */
  slug: string;
  /** Pages in order, page 1 first. */
  pages: Sample[];
};

/** Books shown off on the homepage, and how many images each contributes. */
const MAX_STORIES = 4;
const MAX_PAGES_PER_STORY = 2;

function imagesFor(story: Story): string[] {
  const authored = [...(story.samplePages ?? []), ...(story.gallery ?? [])];
  const pool = authored.length ? authored : [story.coverImage];
  // A book whose gallery repeats its cover would otherwise crossfade onto
  // itself, which reads as the slideshow having stalled.
  return Array.from(new Set(pool.filter(Boolean))).slice(0, MAX_PAGES_PER_STORY);
}

/** One entry per live book, each with a few of its own pages. */
export function storySamples(stories: Story[]): StorySamples[] {
  return stories
    .map((s) => ({
      title: s.title,
      slug: s.slug,
      pages: imagesFor(s).map((src, i) => ({
        src,
        alt: `Page ${i + 1} of ${s.title}, a personalized KuttyStory book`,
      })),
    }))
    .filter((s) => s.pages.length > 0)
    .slice(0, MAX_STORIES);
}

/**
 * Hero slideshow: the live books' pages, in catalogue order. Capped because
 * every slide is downloaded up front (images.unoptimized) and a loop longer
 * than about twenty seconds never comes back round while anyone is watching.
 */
const MAX_HERO_SLIDES = 6;

export function heroSamples(stories: Story[]): Sample[] {
  return storySamples(stories)
    .flatMap((s) => s.pages)
    .slice(0, MAX_HERO_SLIDES);
}
