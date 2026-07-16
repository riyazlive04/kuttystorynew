/**
 * Real storybook pages shown on the homepage — the hero slideshow and the
 * "See the magic" carousels.
 *
 * To change them: drop square page JPGs into `apps/web/public/samples/` and list
 * them here, page 1 first. Keep them ~1200px and under ~300KB — `images.unoptimized`
 * is on in next.config.mjs, so whatever is committed is exactly what visitors
 * download.
 */
export type Sample = { src: string; alt: string };

export type StorySamples = {
  /** Matches Story.title in the DB. */
  title: string;
  /** Links the card to /stories/<slug>. */
  slug: string;
  /** Pages in order, page 1 first. */
  pages: Sample[];
};

export const STORY_SAMPLES: StorySamples[] = [
  {
    title: "Cricket",
    slug: "cricket",
    pages: [
      {
        src: "/samples/sample-1.jpg",
        alt: "Aarav practising cricket in his backyard, from a personalized storybook",
      },
      {
        src: "/samples/sample-2.jpg",
        alt: "Aarav in an India jersey at a packed stadium, from a personalized storybook",
      },
      {
        src: "/samples/sample-3.jpg",
        alt: "Aarav breaking a flower pot with a big shot, from a personalized storybook",
      },
    ],
  },
  {
    title: "Moonstone Academy",
    slug: "moonstone-academy",
    pages: [
      {
        src: "/samples/moonstone-1.jpg",
        alt: "A boy reading adventure books in his moonlit bedroom, from a personalized storybook",
      },
      {
        src: "/samples/moonstone-2.jpg",
        alt: "A glowing golden invitation to Moonstone Academy floating through a window",
      },
    ],
  },
];

/** Hero slideshow: pages 1-2 of every story, interleaved in story order. */
export const HERO_SAMPLES: Sample[] = STORY_SAMPLES.flatMap((s) =>
  s.pages.slice(0, 2),
);
