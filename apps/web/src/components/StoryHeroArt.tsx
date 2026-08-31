"use client";

import { StoryCover, useStoryGender } from "@/components/StoryGender";
import { FaceSwapDemo } from "@/components/FaceSwapDemo";
import { faceDemoFor } from "@/lib/faceDemo";
import type { Story } from "@/lib/types";

/**
 * The hero artwork on a book page: the face-swap demo where we have rendered
 * one, the plain cover everywhere else.
 *
 * The demo defers to the wizard's Boy/Girl picker. Its frames were swapped onto
 * one illustrated variant, so the moment a visitor asks for the other one the
 * honest thing to show is that book's own cover -- a demo that contradicts the
 * choice the visitor just made sells nothing.
 */
export function StoryHeroArt({ story }: { story: Story }) {
  const { gender } = useStoryGender();
  const demo = faceDemoFor(story.slug);

  if (demo && demo.variant === gender) {
    return <FaceSwapDemo demo={demo} title={story.title} />;
  }
  return <StoryCover story={story} />;
}
