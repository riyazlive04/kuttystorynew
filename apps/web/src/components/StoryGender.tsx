"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Image from "next/image";
import type { Story } from "@/lib/types";
import { coverFor } from "@/lib/covers";
import { webImage } from "@/lib/img";

export type Gender = "boy" | "girl";

type StoryGenderValue = { gender: Gender; setGender: (g: Gender) => void };

const StoryGenderContext = createContext<StoryGenderValue | null>(null);

/**
 * The gender picked in the personalize wizard, shared with the artwork sitting
 * beside it. A both-gender book is illustrated twice, so the cover has to
 * follow the choice — otherwise a girl's book is shown under the boy artwork.
 * The wizard owns the choice; everything else here only reads it.
 */
export function StoryGenderProvider({
  story,
  children,
}: {
  story: Story;
  children: ReactNode;
}) {
  // Same starting point the wizard offers: a locked book has one option.
  const [gender, setGender] = useState<Gender>(story.genderLock ?? "boy");
  return (
    <StoryGenderContext.Provider value={{ gender, setGender }}>
      {children}
    </StoryGenderContext.Provider>
  );
}

export function useStoryGender(): StoryGenderValue {
  const value = useContext(StoryGenderContext);
  if (!value) {
    throw new Error("useStoryGender must be used inside <StoryGenderProvider>");
  }
  return value;
}

/** The hero cover on the story page, swapping as the wizard's Boy/Girl picker
 *  is used. Kept as its own client island so the rest of the page stays
 *  server-rendered. */
export function StoryCover({ story }: { story: Story }) {
  const { gender } = useStoryGender();
  return (
    <Image
      src={webImage(coverFor(story, gender), 1200)}
      alt={`${story.title} - personalized children's storybook cover for a ${gender}`}
      fill
      priority
      sizes="(max-width: 1024px) 100vw, 600px"
      className="object-cover"
    />
  );
}
