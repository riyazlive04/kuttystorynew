import { STORIES, getStory } from "./data";
import type { Story } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL;

// Story pages are statically rendered and refreshed in the background, so a
// crawler always gets full HTML instead of a spinner. Five minutes is short
// enough that a title published in the admin CMS goes live quickly.
export const STORY_REVALIDATE = 300;

/**
 * Server-side catalogue read. Unlike the client `listStories()` this never
 * throws and never returns an empty list: if the backend is unreachable — which
 * is the normal case during `next build` inside Docker — it falls back to the
 * bundled catalogue so pages still render with real content.
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
      // Backend down or not yet reachable — fall through to bundled data.
    }
  }
  return STORIES;
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
      // Fall through to bundled data.
    }
  }
  return getStory(slug);
}
