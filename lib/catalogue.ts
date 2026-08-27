import type { StoreProduct } from "@/types/commerce";

export function isProductSoldOut(product: StoreProduct) {
  return product.available === false || product.stockQuantity === 0;
}

export function getMaximumPurchasableQuantity(product: StoreProduct) {
  if (typeof product.stockQuantity !== "number" || product.stockQuantity <= 0) return null;
  return product.stockQuantity;
}

export function clampProductQuantity(product: StoreProduct, quantity: number) {
  const requested = Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1));
  const maximum = getMaximumPurchasableQuantity(product);
  return maximum === null ? requested : Math.min(requested, maximum);
}
