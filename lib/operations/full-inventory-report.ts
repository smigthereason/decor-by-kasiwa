import type { InventoryItem } from "./types";

export type FullInventoryRow = {
  [key: string]: string | number;
  level: string;
  name: string;
  sku: string;
  category: string;
  variant: string;
  location: string;
  onHand: number | string;
  incoming: number | string;
  reserved: number | string;
  unallocated: number | string;
  unitCost: number;
  retailPrice: number;
};

/**
 * Read-only export. Rows are hierarchical: COMPANY, LOCATION, VARIANT, and
 * UNALLOCATED are distinct grains and MUST NOT be added together.
 * Unallocated stock is not presumed sellable (may contain quarantined units).
 */
export function fullInventoryReportRows(
  items: InventoryItem[],
  opts: { includeCompany: boolean; hideProcurement: boolean },
): FullInventoryRow[] {
  const rows: FullInventoryRow[] = [];
  for (const item of items) {
    const base = {
      name: item.name, sku: item.sku, category: item.category, variant: "",
      reserved: "", unallocated: "", retailPrice: item.retailPrice,
      unitCost: opts.hideProcurement ? 0 : item.unitCost,
    };
    if (opts.includeCompany) {
      rows.push({ ...base, level: "COMPANY", location: "All locations (company total)",
        onHand: item.companyOnHand ?? item.onHand, incoming: item.incoming,
        reserved: item.reserved, unallocated: item.unallocatedOnHand ?? "" });
    }
    for (const store of item.locationBalances || []) {
      rows.push({ ...base, level: "LOCATION", location: `${store.storeName}${store.storeCode ? ` (${store.storeCode})` : ""}`,
        onHand: store.onHand, incoming: store.incoming });
      for (const variant of store.variants || []) {
        rows.push({ ...base, level: "VARIANT", location: store.storeName,
          variant: variant.variantLabel || item.variants?.find((v) => v.id === variant.variantId)?.title || variant.variantId,
          onHand: variant.onHand, incoming: variant.incoming });
      }
    }
    if (opts.includeCompany && Number(item.unallocatedOnHand || 0) > 0) {
      rows.push({ ...base, level: "UNALLOCATED — REVIEW", location: "No assigned store; not assumed sellable",
        onHand: item.unallocatedOnHand ?? 0, incoming: "" });
    }
    // When scoped by server authorization, display the assigned-store data only.
    if (!opts.includeCompany && !(item.locationBalances || []).length) {
      rows.push({ ...base, level: "ASSIGNED STORE", location: item.location,
        onHand: item.onHand, incoming: item.incoming });
    }
  }
  return rows;
}
