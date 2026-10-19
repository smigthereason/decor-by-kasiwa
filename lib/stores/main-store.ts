import "server-only";

import { unstable_cache } from "next/cache";
import { serverClient } from "@/sanity/lib/serverClient";

export type MainStore = { id: string; name: string; code?: string };

/**
 * Only one active MAIN may be inferred. If multiple Main stores exist, set
 * DBK_MAIN_STORE_ID in the server environment; never guess an order's branch.
 */
export const getMainStore = unstable_cache(async (): Promise<MainStore | null> => {
  const candidates = await serverClient.fetch<Array<{ _id: string; name: string; code?: string }>>(
    `*[_type == "storeLocation" && locationType == "MAIN" && active != false]{_id,name,code}`,
    {}, { cache: "no-store" },
  );
  const configuredId = process.env.DBK_MAIN_STORE_ID?.trim();
  const chosen = configuredId
    ? candidates.find((item) => item._id === configuredId)
    : candidates.length === 1 ? candidates[0] : undefined;
  if (!chosen) return null;
  return { id: chosen._id, name: chosen.name, code: chosen.code };
}, ["dbk-primary-online-main-store-v1"], { revalidate: 300 });

/** Legacy online orders without an explicit store are attributed to Main for
 * reporting only. Historical records, receipts and inventory are not rewritten.
 */
export const legacyAssignedStoreFilter = `(!defined(assignedStore) || assignedStore in ["", "Company / online", "Company-wide", "Online"])`;
export const legacyOnlineOrderFilter = `coalesce(salesChannel,"ONLINE") == "ONLINE" && !defined(storeLocation._ref) && ${legacyAssignedStoreFilter}`;
export function isLegacyStoreName(name?: string) {
  return !name || ["Company / online", "Company-wide", "Online"].includes(name);
}
export const storeOrderPredicate = `(!defined($storeId) || storeLocation._ref == $storeId || ($storeId == $mainStoreId && ${legacyOnlineOrderFilter}))`;
export const relatedOrderPredicate = `(!defined($storeId) || order->storeLocation._ref == $storeId || ($storeId == $mainStoreId && coalesce(order->salesChannel,"ONLINE") == "ONLINE" && !defined(order->storeLocation._ref) && (!defined(order->assignedStore) || order->assignedStore in ["", "Company / online", "Company-wide", "Online"])))`;
