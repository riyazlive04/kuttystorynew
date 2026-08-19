import type { Metadata } from "next";
import { StoryLibrary } from "@/components/StoryLibrary";
import { JsonLd } from "@/components/JsonLd";
import { getStories, STORY_REVALIDATE } from "@/lib/stories.server";
import { SITE_URL, abs, breadcrumbJsonLd } from "@/lib/seo";

export const revalidate = STORY_REVALIDATE;

export const metadata: Metadata = {
  title: "Story Library - Personalized Children's Books | KuttyStory",
  description:
    "Browse every KuttyStory title - learning, adventure, imagination and bedtime books personalized with your child's name and face. English and Tamil, free preview on every story.",
  alternates: { canonical: "/stories" },
  openGraph: {
    title: "The KuttyStory Library - Personalized Children's Books",
    description:
      "Every book is personalized with your child's name, face and language. Free preview on every story.",
    url: `${SITE_URL}/stories`,
    type: "website",
  },
};

export default async function StoriesPage() {
  // Server-fetched: the catalogue ships in the HTML instead of behind a spinner.
  const stories = await getStories();

  return (
    <div className="container-x py-12 md:py-16">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Story Library", path: "/stories" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "The KuttyStory Library",
            url: `${SITE_URL}/stories`,
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: stories.length,
              itemListElement: stories.map((s, i) => ({
                "@type": "ListItem",
                position: i + 1,
                name: s.title,
                url: abs(`/stories/${s.slug}`),
              })),
            },
          },
        ]}
      />

      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold text-slate-deep md:text-5xl">
          The Story Library
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-mutedText">
          Every book is fully personalized with your child&apos;s name, face and
          language. Pick one to begin - the preview is always free.
        </p>
      </header>

      <StoryLibrary stories={stories} />
    </div>
  );
}
