import type { Order } from "./types";

/** This card is merchandise revenue from fully paid orders (not cash flow or net profit). */
export function dbk148DashboardOrders(legacy: Order[], neon: Order[]) {
  const ids = new Set<string>();
  const references = new Set<string>();
  for (const order of neon) {
    if (!order.id || ids.has(order.id)) throw new Error("Duplicate Neon dashboard order ID");
    ids.add(order.id);
    const ref = order.paymentReference?.trim();
    if (ref) {
      if (references.has(ref)) throw new Error("Duplicate Neon dashboard payment reference");
      references.add(ref);
    }
  }
  const merged = [...neon, ...legacy.filter(order => !ids.has(order.id) &&
    (!order.paymentReference?.trim() || !references.has(order.paymentReference.trim())))];
  const paid = merged.filter(order => order.paymentStatus === "paid");
  const revenue = paid.reduce((sum, order) => {
    const value = order.subtotal - Number(order.discountAmount || 0);
    if (!Number.isFinite(value)) throw new Error("Invalid dashboard revenue amount");
    return sum + Math.max(0, value);
  }, 0);
  // Abandoned/failed checkouts and in-store POS sales are not fulfilment orders.
  const openOrders = paid.filter(order => order.salesChannel !== "POS" &&
    ["paid", "processing", "ready_for_store", "picking", "packed", "dispatched"].includes(order.status)).length;
  const recent = [...paid].sort((a,b) => (b.soldAt || b.createdAt).localeCompare(a.soldAt || a.createdAt)).slice(0, 5);
  return { revenue, openOrders, recent };
}
