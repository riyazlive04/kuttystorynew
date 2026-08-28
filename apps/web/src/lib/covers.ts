import type { Story } from "./types";

/**
 * The cover art for a child of this gender.
 *
 * A book authored for both genders is drawn twice — the boy and girl artwork
 * are different illustrations — so the shop image has to follow whoever the
 * book is being personalized for. `coverImage` holds the primary variant (the
 * locked gender, else boy) and `coverImageGirl` the girl one; a book with only
 * one variant authored has no girl cover and falls back to the primary.
 */
export function coverFor(story: Story, gender: "boy" | "girl"): string {
  if (gender === "girl" && story.coverImageGirl) return story.coverImageGirl;
  return story.coverImage;
}
