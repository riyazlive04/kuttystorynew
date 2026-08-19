import type { MetadataRoute } from "next";
import { getStories } from "@/lib/stories.server";
import { SITE_URL } from "@/lib/seo";

// Regenerated hourly so titles published in the admin CMS appear without a
// redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/stories`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    {
      url: `${SITE_URL}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const stories = await getStories();
  const storyRoutes: MetadataRoute.Sitemap = stories.map((s) => ({
    url: `${SITE_URL}/stories/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...storyRoutes];
}
