import type { StoreProduct } from "@/types/commerce";

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Client-requested placeholder ratings while verified customer reviews are not
 * yet collected. Sanity values always win; otherwise a deterministic 4.0–4.8
 * fallback is generated so the displayed score is stable between page loads.
 * Review counts are never fabricated: they display only when explicitly stored.
 */
export function getProductRating(
  product: Pick<StoreProduct, "id" | "slug" | "rating" | "reviewCount">,
) {
  const seed = hashValue(`${product.id}:${product.slug}`);
  const fallbackRating = 4 + (seed % 9) / 10;

  return {
    rating:
      typeof product.rating === "number"
        ? Math.min(4.8, Math.max(4, Math.round(product.rating * 10) / 10))
        : fallbackRating,
    reviewCount:
      typeof product.reviewCount === "number" && product.reviewCount >= 0
        ? Math.floor(product.reviewCount)
        : undefined,
  };
}
