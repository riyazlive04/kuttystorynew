/**
 * Pre-rendered face-swap demos for the book page.
 *
 * Each frame pairs a real child's PHOTO with the cover art that photo produced
 * -- swapped by the production pipeline (Segmind faceswap-comic, at the
 * strengths in the API config), from the live cover art, not a mock-up. Showing
 * the source photo beside the result is the point: a parent can see where the
 * face came from, which no amount of copy explains as well.
 *
 * Keyed by the LIVE catalogue slug. A title with no entry renders its static
 * cover, unchanged. To add one: run the swap for that cover against a few
 * sample faces, drop the JPEGs in public/samples/faceswap/, add the slug.
 */
export type FaceDemoFrame = {
  /** The cover with this child's face swapped in. */
  src: string;
  /** The headshot that face came from, shown in the corner. */
  photo: string;
  /** The example child, named in the caption. */
  child: string;
};

export type FaceDemo = {
  /** Which illustrated variant these frames were rendered from. A both-gender
   *  book is drawn twice, and the demo only stands in for the variant it was
   *  actually rendered against -- otherwise picking "Girl" in the wizard would
   *  be answered with a boy's cover. */
  variant: "boy" | "girl";
  /** The untouched illustration -- the "before" the loop returns to. */
  base: string;
  frames: FaceDemoFrame[];
  /** Where the face sits in the art, in % of the image, so the arrow and the
   *  highlight ring land on the face instead of the middle of the page. */
  face: { x: number; y: number; w: number; h: number };
};

const DEMOS: Record<string, FaceDemo> = {
  "space-explorer": {
    variant: "boy",
    base: "/samples/faceswap/space-explorer-base.jpg",
    frames: [
      {
        src: "/samples/faceswap/space-explorer-a.jpg",
        photo: "/samples/faceswap/space-explorer-face-a.jpg",
        child: "Aarav",
      },
      {
        src: "/samples/faceswap/space-explorer-b.jpg",
        photo: "/samples/faceswap/space-explorer-face-b.jpg",
        child: "Vihaan",
      },
      {
        src: "/samples/faceswap/space-explorer-c.jpg",
        photo: "/samples/faceswap/space-explorer-face-c.jpg",
        child: "Kabir",
      },
    ],
    // Measured off the live plate: the helmet bubble sits left of centre.
    face: { x: 43.5, y: 52, w: 34, h: 34 },
  },
};

export function faceDemoFor(slug: string): FaceDemo | undefined {
  return DEMOS[slug];
}
