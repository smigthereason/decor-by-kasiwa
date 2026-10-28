/**
 * Reduce Sanity image CDN transfer while leaving external and non-image URLs alone.
 * Intended for publicly displayed images only, not file downloads or private assets.
 * Do not use this helper to construct stock, auth or payment URLs.
 */
export function optimizeSanityImageUrl(
  value: string,
  { width = 1200, quality = 72 }: { width?: number; quality?: number } = {},
): string {
  if (!value || !Number.isInteger(width) || width < 1 || width > 4096 ||
      !Number.isInteger(quality) || quality < 1 || quality > 100) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "cdn.sanity.io" ||
        !url.pathname.startsWith("/images/") ||
        /\.(?:gif|svg)$/i.test(url.pathname)) return value;
    // Respect a smaller existing width; do not throw away authored crops/rects.
    const existing = Number(url.searchParams.get("w"));
    const target = Number.isFinite(existing) && existing > 0 ? Math.min(width, existing) : width;
    url.searchParams.set("w", String(Math.floor(target)));
    const existingQuality = Number(url.searchParams.get("q"));
    url.searchParams.set("q", String(
      Number.isFinite(existingQuality) && existingQuality > 0
        ? Math.min(quality, existingQuality) : quality,
    ));
    if (!url.searchParams.has("fit")) url.searchParams.set("fit", "max");
    if (!url.searchParams.has("auto") && !url.searchParams.has("fm")) {
      url.searchParams.set("auto", "format");
    }
    return url.toString();
  } catch {
    return value;
  }
}
