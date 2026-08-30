import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "@/lib/seo";

// Admin plus the transactional funnel: nothing here is a landing page, and
// order/preview URLs carry customer-specific ids.
const DISALLOW = PRIVATE_PATHS.map((p) => `${p}/`).concat(PRIVATE_PATHS);

/**
 * The AI crawlers are named explicitly rather than left to the `*` rule.
 *
 * Two of them are not really crawlers at all: `Google-Extended` and `Applebot-
 * Extended` are opt-out tokens that gate whether the site can be used to ground
 * Gemini and Apple Intelligence answers, and a site that blocks them can rank
 * in classic search while being invisible in the AI answer above it. Naming
 * them here makes the decision to be citable explicit and hard to undo by
 * accident, and it holds the same private-path exclusions as everyone else —
 * an assistant has no more business quoting a customer's order page than
 * Googlebot does indexing one.
 */
const AI_AGENTS = [
  "GPTBot", // OpenAI — training and ChatGPT browsing
  "OAI-SearchBot", // OpenAI — ChatGPT Search index
  "ChatGPT-User", // OpenAI — fetches a page a user asked about
  "ClaudeBot", // Anthropic — Claude
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot", // Perplexity — index
  "Perplexity-User", // Perplexity — live fetch for a user's question
  "Google-Extended", // Gemini / AI Overviews grounding
  "Applebot-Extended", // Apple Intelligence
  "Bingbot", // Powers Copilot as well as Bing
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
