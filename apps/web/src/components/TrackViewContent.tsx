"use client";

import { useEffect } from "react";
import { CURRENCY, track } from "@/lib/pixel";

/**
 * Fires ViewContent for one book.
 *
 * A tiny client island so the story page itself stays a server component: the
 * page is statically rendered for SEO, and only this one node runs in the
 * browser. ViewContent is what "people who viewed this book" retargeting and
 * Advantage+ catalogue ads are built from, so it carries the same ids the
 * cart and purchase events use.
 */
export function TrackViewContent({
  slug,
  title,
  price,
  category,
}: {
  slug: string;
  title: string;
  price: number;
  category?: string;
}) {
  useEffect(() => {
    track("ViewContent", {
      content_type: "product",
      content_ids: [slug],
      content_name: title,
      content_category: category,
      value: price,
      currency: CURRENCY,
    });
  }, [slug, title, price, category]);

  return null;
}
