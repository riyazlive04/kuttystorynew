import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Admin plus the transactional funnel: nothing here is a landing page,
        // and order/preview URLs carry customer-specific ids.
        disallow: PRIVATE_PATHS.map((p) => `${p}/`).concat(PRIVATE_PATHS),
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
