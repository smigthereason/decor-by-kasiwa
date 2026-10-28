import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { optimizeSanityImageUrl } from "../sanity/lib/optimizedImage.ts";

const base = "https://cdn.sanity.io/images/g34n810u/production/abc-5472x3648.jpg";
test("bounds original-size Sanity image requests and enables format negotiation", () => {
  const url = new URL(optimizeSanityImageUrl(base, { width: 640, quality: 70 }));
  assert.equal(url.searchParams.get("w"), "640");
  assert.equal(url.searchParams.get("q"), "70");
  assert.equal(url.searchParams.get("fit"), "max");
  assert.equal(url.searchParams.get("auto"), "format");
});
test("never enlarges images or increases existing quality", () => {
  const url = new URL(optimizeSanityImageUrl(base + "?w=320&q=50&crop=center", { width: 1200 }));
  assert.equal(url.searchParams.get("w"), "320");
  assert.equal(url.searchParams.get("q"), "50");
  assert.equal(url.searchParams.get("crop"), "center");
});
test("does not rewrite other hosts, non-image files, unsupported formats or bad URLs", () => {
  for (const u of ["https://images.unsplash.com/abc", "https://cdn.sanity.io/files/x/y/z.pdf", "https://cdn.sanity.io/images/x/y/a.gif", "blob:foo", "not-a-url"]) {
    assert.equal(optimizeSanityImageUrl(u), u);
  }
});
test("respects existing format selection and validates caps", () => {
  const transformed = new URL(optimizeSanityImageUrl(base + "?fm=webp"));
  assert.equal(transformed.searchParams.get("fm"), "webp");
  assert.equal(transformed.searchParams.has("auto"), false);
  assert.equal(optimizeSanityImageUrl(base, { width: -1 }), base);
});
test("public storefront CDN does not change POS or settlement readers", () => {
  const src = readFileSync(new URL("../sanity/lib/catalog.ts", import.meta.url), "utf8");
  assert.match(src, /channel === "pos" \|\| process\.env\.DBK_PUBLIC_CATALOG_CDN === "0"/);
  assert.match(src, /channel === "pos" \? \{ cache: "no-store" \}/);
  assert.match(src, /await serverClient\.fetch<StoreInventoryRow\[\]>/);
});
test("public settings are bounded; authorizations remain untouched", () => {
  const src = readFileSync(new URL("../sanity/lib/siteSettings.ts", import.meta.url), "utf8");
  assert.match(src, /revalidate: 300/);
  assert.doesNotMatch(src, /cache: "no-store"/);
});
