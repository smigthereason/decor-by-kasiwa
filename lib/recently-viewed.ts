"use client";

import type { StoreProduct } from "@/types/commerce";

export const RECENTLY_VIEWED_STORAGE_KEY = "dbk.recentlyViewed.v1";
export const RECENTLY_VIEWED_EVENT = "dbk:recently-viewed";
export const RECENTLY_VIEWED_LIMIT = 12;

export type RecentlyViewedProduct = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string;
  price: number;
  retailPrice?: number;
  viewedAt: string;
};

function isEntry(value: unknown): value is RecentlyViewedProduct {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.productId === "string" &&
    typeof entry.slug === "string" &&
    typeof entry.name === "string" &&
    typeof entry.imageUrl === "string" &&
    typeof entry.price === "number" &&
    typeof entry.viewedAt === "string"
  );
}

export function readRecentlyViewed(): RecentlyViewedProduct[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, RECENTLY_VIEWED_LIMIT);
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(product: StoreProduct) {
  if (typeof window === "undefined") return [];

  const entry: RecentlyViewedProduct = {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    imageUrl: product.heroImage || product.images?.[0] || "",
    price: product.price,
    retailPrice: product.retailPrice,
    viewedAt: new Date().toISOString(),
  };

  const next = [entry, ...readRecentlyViewed().filter((item) => item.productId !== product.id)].slice(
    0,
    RECENTLY_VIEWED_LIMIT,
  );

  try {
    window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_EVENT));
  } catch {
    // Browsing must continue even if storage is blocked or unavailable.
  }

  return next;
}
