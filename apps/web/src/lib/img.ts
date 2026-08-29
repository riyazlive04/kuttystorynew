/**
 * Ask the API for a web-sized copy of an upload.
 *
 * The base art is print art: 2482px, CMYK, 11-12MB a plate. Served straight to
 * a browser that is showing it 500px wide, the homepage's hero alone measured
 * 55.6MB — and a CMYK JPEG is rendered inconsistently by browsers even after
 * they have downloaded all of it.
 *
 * `/uploads/<name>?w=` returns an sRGB JPEG at the nearest width on the API's
 * ladder, generated once and cached. Widths here should be the DISPLAYED width
 * roughly doubled, so a 2x screen still gets real pixels.
 */

/** Widths the API will actually produce; anything else snaps to the nearest. */
export const IMG_WIDTHS = [320, 480, 640, 800, 1200, 1600, 2000] as const;

export function webImage(src: string | undefined | null, width: number): string {
  if (!src) return "";
  // Only uploads have derivatives. Bundled art (/samples, /covers, the SVG
  // placeholders) is already small, and appending a query to it would only
  // defeat caching. A data: URL is the wizard's own preview and is not ours.
  if (!src.includes("/uploads/") || src.startsWith("data:")) return src;
  if (src.includes("?")) return src;
  return `${src}?w=${width}`;
}
