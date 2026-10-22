"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { RECENTLY_VIEWED_EVENT, readRecentlyViewed } from "@/lib/recently-viewed";

// Send only new customer-view snapshots. Strict Mode, two components, or a
// repeated event must not trigger the same Sanity read + write multiple times.
const lastSubmitted = new Map<string, string>();
const pending = new Set<string>();

async function syncRecentViews(customerId: string) {
  const entries = readRecentlyViewed().map(({ productId, viewedAt }) => ({ productId, viewedAt }));
  if (!entries.length) return;
  const fingerprint = JSON.stringify(entries);
  const key = `${customerId}:${fingerprint}`;
  if (pending.has(key) || lastSubmitted.get(customerId) === fingerprint) return;
  pending.add(key);
  try {
    const response = await fetch("/api/analytics/product-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
    if (response.ok) lastSubmitted.set(customerId, fingerprint);
  } catch {
    // Keep local recently viewed working even if a sync fails; allow retry.
  } finally {
    pending.delete(key);
  }
}

export default function RecentViewSync() {
  const { data: session, status } = useSession();
  const customerId = status === "authenticated" && session?.user?.role === "CUSTOMER"
    ? session.user.id
    : undefined;

  useEffect(() => {
    // Staff and guests must not POST customer history (previously causing
    // needless authenticated Sanity lookups, even when no data was written).
    if (!customerId) return;
    void syncRecentViews(customerId);
    const handleSync = () => void syncRecentViews(customerId);
    window.addEventListener(RECENTLY_VIEWED_EVENT, handleSync);
    return () => window.removeEventListener(RECENTLY_VIEWED_EVENT, handleSync);
  }, [customerId]);

  return null;
}
