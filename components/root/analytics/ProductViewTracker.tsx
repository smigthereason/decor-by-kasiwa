"use client";

import { useEffect, useRef } from "react";

import { recordRecentlyViewed } from "@/lib/recently-viewed";
import type { StoreProduct } from "@/types/commerce";

export default function ProductViewTracker({ product }: { product: StoreProduct }) {
  const lastTrackedProductId = useRef<string | null>(null);
  useEffect(() => {
    // Do not record duplicate views when React replays mount effects.
    if (lastTrackedProductId.current === product.id) return;
    lastTrackedProductId.current = product.id;
    recordRecentlyViewed(product);

    window.gtag?.("event", "view_item", {
      currency: "KES",
      value: product.price,
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          item_category: product.category,
          price: product.price,
        },
      ],
    });
  }, [product]);

  return null;
}
