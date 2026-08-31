/**
 * Pre-rendered face-swap demos for the book page.
 *
 * Each frame is the SAME cover art with a different child's face swapped in by
 * the production pipeline (Segmind faceswap-comic, at the strengths in
 * apps/api config) -- not a mock-up. That is the whole point: the animation on
 * the product page is output from the machine that makes the book, so what a
 * parent is shown is what they get.
 *
 * A title with no entry here renders its static cover, unchanged. To add one:
 * run the swap for that cover against a few sample faces, drop the JPEGs in
 * public/samples/faceswap/, and add the slug below.
 */
export type FaceDemoFrame = {
  src: string;
  /** The example child in this frame, named in the caption. */
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
  /** Where the face sits in the art, in % of the image, so the scan sweep and
   *  the highlight ring land on the face instead of the middle of the page. */
  face: { x: number; y: number; w: number; h: number };
};

const DEMOS: Record<string, FaceDemo> = {
  "journey-to-the-stars": {
    variant: "boy",
    base: "/samples/faceswap/journey-to-the-stars-base.jpg",
    frames: [
      { src: "/samples/faceswap/journey-to-the-stars-a.jpg", child: "Aarav" },
      { src: "/samples/faceswap/journey-to-the-stars-b.jpg", child: "Vihaan" },
      { src: "/samples/faceswap/journey-to-the-stars-c.jpg", child: "Kabir" },
    ],
    // Measured off the plate: the helmet bubble sits left of centre.
    face: { x: 43, y: 51, w: 38, h: 38 },
  },
};

export function faceDemoFor(slug: string): FaceDemo | undefined {
  return DEMOS[slug];
}
