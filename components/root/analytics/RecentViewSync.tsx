"use client";

import { useEffect } from "react";

import { RECENTLY_VIEWED_EVENT, readRecentlyViewed } from "@/lib/recently-viewed";

async function syncRecentViews() {
  const entries = readRecentlyViewed().map(({ productId, viewedAt }) => ({ productId, viewedAt }));
  if (!entries.length) return;

  try {
    await fetch("/api/analytics/product-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
  } catch {
    // Product browsing should never be interrupted by analytics sync failures.
  }
}

export default function RecentViewSync() {
  useEffect(() => {
    void syncRecentViews();

    const handleSync = () => void syncRecentViews();
    window.addEventListener(RECENTLY_VIEWED_EVENT, handleSync);
    return () => window.removeEventListener(RECENTLY_VIEWED_EVENT, handleSync);
  }, []);

  return null;
}
