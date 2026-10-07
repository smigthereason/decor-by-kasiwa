"use client";

import { useEffect } from "react";

import { recordRecentlyViewed } from "@/lib/recently-viewed";
import type { StoreProduct } from "@/types/commerce";

export default function ProductViewTracker({ product }: { product: StoreProduct }) {
  useEffect(() => {
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
