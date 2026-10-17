import { unstable_noStore as noStore } from "next/cache";
import { STORIES, getStory } from "./data";
import type { Story } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL;

// Story pages are statically rendered and refreshed in the background, so a
// crawler always gets full HTML instead of a spinner. Five minutes is short
// enough that a title published in the admin CMS goes live quickly.
export const STORY_REVALIDATE = 300;

/**
 * Is the bundled sample catalogue allowed to stand in for the real one?
 *
 * Only with no backend configured at all -- a developer running the web app on
 * its own, who wants pages with content in them rather than empty grids.
 *
 * NOT when a backend is configured and unreachable. That case used to fall back
 * too, and the consequence was seen in production: while the VPS was down the
 * storefront served six books that do not exist in the CMS, with placeholder
 * SVG covers, each with a Personalize button that could only fail. Static
 * generation then baked the sample slugs into /stories/<slug> pages that
 * outlived the outage. An empty shelf is a bad hour; a shelf of books that
 * cannot be bought is a bad reputation.
 */
const SAMPLES_OK = !API;

/**
 * Server-side catalogue read. Never throws: an unreachable backend returns an
 * empty list, which the grids already have a state for, and which lets Next
 * keep serving the last good page it rendered rather than replacing it.
 */
export async function getStories(): Promise<Story[]> {
  if (API) {
    try {
      const res = await fetch(`${API}/stories`, {
        next: { revalidate: STORY_REVALIDATE, tags: ["stories"] },
      });
      if (res.ok) {
        const data = (await res.json()) as Story[];
        if (Array.isArray(data) && data.length) return data;
      }
    } catch {
      // Backend down or not yet reachable.
    }
    if (!SAMPLES_OK) {
      console.warn("[catalogue] backend unreachable - serving no titles");
      return [];
    }
  }
  return STORIES;
}

/**
 * The catalogue for a page that SHOWS it -- home, shop, gift guide.
 *
 * Same as getStories(), with one difference that matters on a deploy: an
 * empty shelf is never cached. A deploy rebuilds the web image while the API
 * restarts, so the build-time render got no titles, and with no earlier page
 * to fall back on Next served "0 titles" until the next background refresh --
 * the whole shop looked empty after every deploy. Opting this render out of
 * the cache makes the page render live instead (showing the books as soon as
 * the API answers), and a failed background refresh keeps the last good page.
 */
export async function getShelf(): Promise<Story[]> {
  const stories = await getStories();
  if (API && !stories.length) noStore();
  return stories;
}

export async function getStoryBySlug(slug: string): Promise<Story | undefined> {
  if (API) {
    try {
      const res = await fetch(`${API}/stories/${slug}`, {
        next: { revalidate: STORY_REVALIDATE, tags: ["stories", `story:${slug}`] },
      });
      if (res.ok) return (await res.json()) as Story;
      // A definitive 404 from the backend means the title was unpublished.
      if (res.status === 404) return undefined;
    } catch {
      // Backend down or not yet reachable.
    }
    if (!SAMPLES_OK) return undefined;
  }
  return getStory(slug);
}
