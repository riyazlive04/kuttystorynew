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
export type Sample = {
  src: string;
  alt: string;
  /** The book this page came from, and the example child the hero names. */
  storyTitle: string;
  childName: string;
  childAge: number;
};

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

// The hero badge names an example child beside the artwork. It is illustrative,
// not a customer, so the names are ours -- but it should not contradict what is
// on screen, which is what a single hardcoded "Aarav, age 4" did as soon as the
// slideshow moved onto a girl's book.
//
// The gender follows the same rule the artwork does: samplePages are the
// primary variant, which is the locked gender or else boy (see
// pages_layout.primary_variant), so the name matches the child in the picture.
const BOY_NAMES = ["Aarav", "Vihaan", "Kabir", "Arjun"];
const GIRL_NAMES = ["Anaya", "Diya", "Meera", "Saanvi"];

/** An example child for one slide: a name that suits the book's artwork, an age
 *  drawn from that book's own range rather than a number we made up.
 *
 *  Per SLIDE, not per book. A book contributes two pages, and keying this to
 *  the book would leave the badge sitting still through an image change --
 *  which is the thing it is here to avoid. */
function exampleChild(story: Story, seed: number): { name: string; age: number } {
  const pool = story.genderLock === "girl" ? GIRL_NAMES : BOY_NAMES;
  const min = story.minAge ?? 3;
  const max = Math.max(min, story.maxAge ?? min + 3);
  return {
    // Indexed, not random: this renders on the server and hydrates on the
    // client, and the two have to agree.
    name: pool[seed % pool.length],
    age: min + (seed % (max - min + 1)),
  };
}

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
    .map((s, storyIndex) => ({
      title: s.title,
      slug: s.slug,
      pages: imagesFor(s).map((src, i) => {
        // A flat slide index. storyIndex + i collides across books -- book 1's
        // second page and book 2's first would both seed 2 and name the same
        // child twice in a row, on the one transition where it is most visible.
        const child = exampleChild(s, storyIndex * MAX_PAGES_PER_STORY + i);
        return {
          src,
          alt: `Page ${i + 1} of ${s.title}, a personalized KuttyStory book`,
          storyTitle: s.title,
          childName: child.name,
          childAge: child.age,
        };
      }),
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
