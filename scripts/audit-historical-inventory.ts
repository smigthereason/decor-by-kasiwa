/**
 * DBK-22: READ-ONLY audit of historical Sanity stock, paid sales and movements.
 * Generates evidence CSV files in ~/Downloads/DBK-inventory-audit.
 * Deliberately does not determine an opening stock figure or modify Sanity.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getCliClient } from "sanity/cli";

type Variant = { _key?: string; title?: string; colour?: string; size?: string; stockQuantity?: number };
type Product = { _id: string; name?: string; initialStock?: number; variants?: Variant[] };
type Balance = { store?: { _ref?: string }; storeId?: string; onHand?: number; incoming?: number; variants?: Array<{ variantId?: string; onHand?: number; incoming?: number }> };
type Inventory = { _id: string; productId?: string; incoming?: number; reserved?: number; incomingByVariant?: Array<{ variantId?: string; quantity?: number }>; locationBalances?: Balance[] };
type Line = { productId?: string; variantId?: string; quantity?: number };
type Order = { _id: string; orderNumber?: string; salesChannel?: string; paymentStatus?: string; status?: string; createdAt?: string; paidAt?: string; lineItems?: Line[] };
type Movement = { _id: string; movementType?: string; productId?: string; variantId?: string; quantityChange?: number; orderId?: string; orderNumber?: string; sourceStoreId?: string; destinationStoreId?: string; createdAt?: string };
type Return = { _id: string; orderNumber?: string; status?: string; restock?: boolean; createdAt?: string; items?: Line[] };
type CsvCell = string | number | boolean | null | undefined;
type Evidence = { productId: string; variantId: string; sourceType: string; documentId: string; number: string; date: string; channel: string; status: string; quantity: number; location: string };

const client = getCliClient().withConfig({ apiVersion: "2026-08-27", useCdn: false, perspective: "published" });
const outDir = process.env.DBK_AUDIT_OUTPUT_DIR || join(homedir(), "Downloads", "DBK-inventory-audit");
const num = (n: unknown) => Number.isFinite(Number(n)) ? Number(n || 0) : 0;
const int = (n: unknown) => Number.isSafeInteger(num(n)) && num(n) >= 0;
const norm = (id: unknown) => String(id || "").trim();
const key = (pid: string, vid?: string) => `${pid}\u0001${vid || ""}`;
const csv = (v: CsvCell) => `"${String(v ?? "").replaceAll('"', '""')}"`;
const csvWrite = (name: string, headers: string[], rows: CsvCell[][]) => {
  const file = join(outDir, name);
  writeFileSync(file, [headers, ...rows].map(row => row.map(csv).join(",")).join("\n") + "\n", "utf8");
  console.log(`${file} (${rows.length} rows)`);
};

async function fetchAll<T>(type: string, projection: string): Promise<T[]> {
  const all: T[] = [];
  let after = "";
  while (true) {
    // Keyset pagination avoids default GROQ result limits and skips no records.
    const batch = await client.fetch<Array<T & { _id: string }>>(
      `*[_type == $type && _id > $after && !(_id in path("drafts.**"))] | order(_id asc)[0...500]${projection}`,
      { type, after },
    );
    if (!batch.length) break;
    all.push(...batch);
    const latest = batch[batch.length - 1]._id;
    if (!latest || latest <= after) throw new Error(`Pagination stalled for ${type}`);
    after = latest;
    if (batch.length < 500) break;
  }
  console.log(`Fetched ${type}: ${all.length}`);
  return all;
}

async function main() {
  const [products, inventories, orders, movements, returns] = await Promise.all([
    fetchAll<Product>("product", `{_id,name,initialStock,variants[]{_key,title,colour,size,stockQuantity}}`),
    fetchAll<Inventory>("inventoryRecord", `{_id,"productId":product._ref,incoming,reserved,incomingByVariant[]{variantId,quantity},locationBalances[]{store,storeId,onHand,incoming,variants[]{variantId,onHand,incoming}}}`),
    fetchAll<Order>("commerceOrder", `{_id,orderNumber,salesChannel,paymentStatus,status,createdAt,paidAt,lineItems[]{"productId":coalesce(productId,product._ref),variantId,quantity}}`),
    fetchAll<Movement>("inventoryMovement", `{_id,movementType,"productId":coalesce(productId,product._ref),variantId,quantityChange,"orderId":order._ref,orderNumber,"sourceStoreId":sourceStore._ref,"destinationStoreId":destinationStore._ref,createdAt}`),
    fetchAll<Return>("returnTransaction", `{_id,orderNumber,status,restock,createdAt,items[]{"productId":coalesce(productId,product._ref),variantId,quantity}}`),
  ]);
  mkdirSync(outDir, { recursive: true });
  const prodById = new Map(products.map(p => [p._id, p]));
  const invById = new Map<string, Inventory[]>();
  for (const inv of inventories) invById.set(inv.productId || "", [...(invById.get(inv.productId || "") || []), inv]);
  const aggregates = new Map<string, { pos: number; online: number; saleMovements: number; returnMovements: number; otherMovements: number; returnedRestocked: number; returnedNotRestocked: number; orderLines: number; unmatchedVariantLines: number }>();
  const evidence: Evidence[] = [];
  let missingProductLines = 0;
  let unknownOrderStatuses = 0;
  const agg = (k: string) => {
    if (!aggregates.has(k)) aggregates.set(k, { pos: 0, online: 0, saleMovements: 0, returnMovements: 0, otherMovements: 0, returnedRestocked: 0, returnedNotRestocked: 0, orderLines: 0, unmatchedVariantLines: 0 });
    return aggregates.get(k)!;
  };
  for (const order of orders) {
    const status = norm(order.paymentStatus).toLowerCase();
    if (!["paid", "partially_paid", "refunded"].includes(status)) {
      if (!["pending", "failed", ""].includes(status)) unknownOrderStatuses++;
      continue;
    }
    const channel = norm(order.salesChannel || "ONLINE").toUpperCase();
    const isPos = channel === "POS";
    for (const line of order.lineItems || []) {
      const pid = norm(line.productId);
      if (!pid || !prodById.has(pid) || !int(line.quantity)) { missingProductLines++; continue; }
      const vid = norm(line.variantId);
      const p = prodById.get(pid)!;
      const a = agg(key(pid, vid));
      a[isPos ? "pos" : "online"] += num(line.quantity);
      a.orderLines++;
      if ((p.variants || []).length && !vid) a.unmatchedVariantLines++;
      evidence.push({ productId: pid, variantId: vid, sourceType: "ORDER", documentId: order._id, number: order.orderNumber || "", date: order.paidAt || order.createdAt || "", channel, status, quantity: num(line.quantity), location: "" });
    }
  }
  for (const movement of movements) {
    const pid = norm(movement.productId);
    if (!pid || !prodById.has(pid)) continue;
    const variantId = norm(movement.variantId);
    const a = agg(key(pid, variantId));
    const type = norm(movement.movementType).toUpperCase();
    const qty = num(movement.quantityChange);
    if (type === "SALE") a.saleMovements += -qty;
    else if (["RETURN", "REFUND_RESTOCK"].includes(type)) a.returnMovements += qty;
    else a.otherMovements += qty;
    evidence.push({ productId: pid, variantId, sourceType: `MOVEMENT:${type || "UNKNOWN"}`, documentId: movement._id, number: movement.orderNumber || movement.orderId || "", date: movement.createdAt || "", channel: "", status: "", quantity: qty, location: movement.sourceStoreId || movement.destinationStoreId || "" });
  }
  for (const ret of returns) {
    for (const line of ret.items || []) {
      const pid = norm(line.productId);
      if (!pid || !prodById.has(pid) || !int(line.quantity)) continue;
      const a = agg(key(pid, norm(line.variantId)));
      if (ret.restock && norm(ret.status) === "completed") a.returnedRestocked += num(line.quantity);
      else a.returnedNotRestocked += num(line.quantity);
      evidence.push({ productId: pid, variantId: norm(line.variantId), sourceType: "RETURN_TRANSACTION", documentId: ret._id, number: ret.orderNumber || "", date: ret.createdAt || "", channel: "", status: `${ret.status || "unknown"}; restock=${String(ret.restock)}`, quantity: num(line.quantity), location: "" });
    }
  }

  const headers = ["productId","productName","variantId","variantName","companyOnHand","allocatedAcrossLocations","allocatedMinusCompany","productInitialStock","sumVariantStock","companyIncoming","sumVariantIncoming","paidPosOrderQty","paidOnlineOrderQty","saleMovementQty","returnMovementQty","otherMovementNetQty","completedReturnRestockQty","otherReturnQty","matchedOrderLines","variantUnspecifiedOrderLines","flag"];
  const rows: CsvCell[][] = [];
  const conflicts = new Set<string>();
  const flaggedProducts = new Set<string>();
  const reviewProducts = new Set<string>();
  for (const p of products) {
    const invs = invById.get(p._id) || [];
    const inv = invs[0];
    const company = num(p.initialStock);
    const companyIncoming = num(inv?.incoming);
    const vTotal = (p.variants || []).reduce((s,v) => s + num(v.stockQuantity), 0);
    const vIncoming = (inv?.incomingByVariant || []).reduce((s,v) => s + num(v.quantity), 0);
    const baseFlags: string[] = [];
    if (invs.length > 1) baseFlags.push("DUPLICATE_INVENTORY_RECORD");
    if ((p.variants || []).length && company !== vTotal) baseFlags.push("PRODUCT_VS_VARIANT_TOTAL");
    if ((p.variants || []).length && companyIncoming !== vIncoming) baseFlags.push("PRODUCT_VS_VARIANT_INCOMING");
    if (num(inv?.reserved) > 0) baseFlags.push("RESERVED_STOCK");
    if (!int(p.initialStock)) baseFlags.push("INVALID_COMPANY_STOCK");
    const balances = inv?.locationBalances || [];
    const variantList: Array<{ vid: string; title: string; qty: number; incoming: number }> = (p.variants || []).length
      ? p.variants!.map(v => ({ vid: norm(v._key), title: v.title || [v.colour,v.size].filter(Boolean).join(" / ") || norm(v._key), qty: num(v.stockQuantity), incoming: num((inv?.incomingByVariant || []).find(x=>x.variantId===v._key)?.quantity) }))
      : [{ vid: "", title: "", qty: company, incoming: companyIncoming }];
    for (const v of variantList) {
      const allocated = balances.reduce((s,b) => s + (v.vid ? (b.variants || []).filter(x=>x.variantId===v.vid).reduce((ss,x)=>ss+num(x.onHand),0) : num(b.onHand)), 0);
      const flags = [...baseFlags];
      if (allocated > v.qty) flags.push("ALLOCATED_EXCEEDS_COMPANY");
      if (allocated < v.qty) flags.push("UNALLOCATED_COMPANY_STOCK");
      const allocatedIncoming = balances.reduce((s,b)=>s + (v.vid ? (b.variants || []).filter(x=>x.variantId===v.vid).reduce((ss,x)=>ss+num(x.incoming),0) : num(b.incoming)),0);
      if (allocatedIncoming > v.incoming) flags.push("ALLOCATED_INCOMING_EXCEEDS_COMPANY");
      const a = agg(key(p._id, v.vid));
      if ((p.variants || []).length && agg(key(p._id, "")).unmatchedVariantLines > 0) flags.push("ORDER_MISSING_VARIANT");
      if (flags.length) reviewProducts.add(p._id);
      // Variant totals are only flags, not separate suggested stock corrections.
      const conflict = flags.some(f => !["UNALLOCATED_COMPANY_STOCK"].includes(f));
      if (conflict) { conflicts.add(key(p._id,v.vid)); flaggedProducts.add(p._id); }
      rows.push([p._id,p.name || "",v.vid,v.title,v.qty,allocated,allocated-v.qty,company,(p.variants || []).length ? vTotal : "",companyIncoming,(p.variants || []).length ? vIncoming : "",a.pos,a.online,a.saleMovements,a.returnMovements,a.otherMovements,a.returnedRestocked,a.returnedNotRestocked,a.orderLines,a.unmatchedVariantLines,flags.join(" | ")]);
    }
  }
  const summary = rows.filter(r => conflicts.has(key(String(r[0]),String(r[2]))));
  const supporting = evidence.filter(e => reviewProducts.has(e.productId));
  const evidenceHeaders = ["productId","variantId","sourceType","documentId","orderOrReference","date","channel","status","quantity","storeIdIfRecorded"];
  csvWrite("DBK-historical-stock-audit-all.csv", headers, rows);
  csvWrite("DBK-historical-stock-audit-conflicts.csv", headers, summary);
  csvWrite("DBK-historical-stock-audit-evidence.csv", evidenceHeaders, supporting.map(e => [e.productId,e.variantId,e.sourceType,e.documentId,e.number,e.date,e.channel,e.status,e.quantity,e.location]));
  console.log(`READ-ONLY COMPLETE. Products=${products.length}; item rows=${rows.length}; flagged item rows=${summary.length}; flagged products=${flaggedProducts.size}; evidence products=${reviewProducts.size}; unmatched/invalid order lines=${missingProductLines}; unusual order statuses=${unknownOrderStatuses}`);
  console.log("IMPORTANT: 'initialStock' is a changing CURRENT value, not verified opening stock. Historical orders must not be deducted again from it. An audit row is evidence, NOT an approved correction.");
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
