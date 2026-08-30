import type { MetadataRoute } from "next";
import { getStories } from "@/lib/stories.server";
import { GUIDES } from "@/lib/guides";
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
      url: `${SITE_URL}/birthday-return-gifts`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    { url: `${SITE_URL}/guides`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
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

  // Guides carry their own authored `updated` date rather than "now": a
  // lastmod that changes on every rebuild teaches crawlers to ignore the field.
  const guideRoutes: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: new Date(g.updated),
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...storyRoutes, ...guideRoutes];
}
