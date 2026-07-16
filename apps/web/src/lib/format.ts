export function inr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Readable preview URL: /preview/<child-story>-<jobId>. The job id (a dash-free
 * cuid) is appended last so it's always recoverable as the final "-" segment.
 */
export function previewPath(
  jobId: string,
  childName?: string,
  storyTitle?: string,
): string {
  const label = slugify([childName, storyTitle].filter(Boolean).join(" "));
  return label ? `/preview/${label}-${jobId}` : `/preview/${jobId}`;
}

/** Recover the raw job id from a preview URL segment (last "-" token). */
export function jobIdFromParam(param: string): string {
  const seg = decodeURIComponent(param || "");
  return seg.split("-").pop() || seg;
}

export function languageLabel(lang: "en" | "ta" | "bilingual"): string {
  switch (lang) {
    case "en":
      return "English";
    case "ta":
      return "Tamil";
    case "bilingual":
      return "English + Tamil";
  }
}
