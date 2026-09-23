"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

/**
 * Reports one page view per screen the customer actually reaches.
 *
 * The container tag itself is loaded in the root layout; this island exists
 * only because the site never reloads the document. Walking from a story to
 * the preview to the checkout is three screens and one page load, so a tag
 * that fires on load alone would report the funnel as a single visit to the
 * story page and nothing else.
 *
 * Fires on the first render too. GTM's own base tags are configured not to
 * send a page view of their own, so this is the only source — one event per
 * screen, first included, rather than two on landing and none thereafter.
 */
export function Analytics() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const query = search.toString();
    track("page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
      page_title: document.title,
    });
    // The query string is part of the identity of a screen here:
    // /order/[id]?pid=… is a different step of the funnel, not the same one.
  }, [pathname, search]);

  return null;
}
