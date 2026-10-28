import "server-only";
import { previewDBK58ManualPosSale, type PosSaleInput, type PosSeller } from "@/lib/pos/server";
import { stageDBK60ManualSale, getDBK60TestOrder, listDBK60TestOrders } from "@/lib/db/dbk60-pos-staging";
import {
  isDbk61SyntheticOrderId, mapDbk61HistoryOrder, dbk61TestReceipt, filterDbk61History,
  type NeonTestOrder, type Dbk61HistoryFilter,
} from "@/lib/db/dbk61-pos-mapper";

/** All gates must be on; the DBK-60 SQL connection additionally pins a specific Neon TEST host. */
export function dbk61SandboxAllowed(request: Request) {
  const url = new URL(request.url);
  return process.env.NODE_ENV === "development" &&
    process.env.DBK58_LOCAL_PREVIEW === "YES" &&
    process.env.DBK60_STAGING_TEST === "YES" &&
    process.env.DBK60_TEST_WRITE === "YES" &&
    process.env.DBK61_LOCAL_POS_COMPAT === "YES" &&
    ["localhost","127.0.0.1"].includes(url.hostname);
}
export { isDbk61SyntheticOrderId };

export async function dbk61StageManualSale(input: PosSaleInput, seller: PosSeller) {
  const preview = await previewDBK58ManualPosSale(input, seller);
  const display = {
    storeName: (seller.storeLocationName || "TEST STORE").slice(0,120),
    sellerName: "TEST ADMIN",
    productNames: preview.productNames.map(name=>name.slice(0,160)),
  };
  const result = await stageDBK60ManualSale(preview.candidate, display);
  const order = await getDBK60TestOrder(preview.candidate.order.orderId);
  if (!order) throw new Error("Staged transaction committed but could not be read back: reconcile before retry");
  const history = mapDbk61HistoryOrder(order as NeonTestOrder);
  return {
    stage: "DBK-61",
    testMode: true,
    simulatedPayment: true,
    productionWrites: false,
    replayed: result.replayed === true,
    orderId: history.id,
    orderNumber: history.orderNumber,
    receiptNumber: history.receiptNumber,
    reference: history.paymentReference,
    status: "completed",
    paymentStatus: history.paymentStatus,
    paymentChannel: "manual",
    total: history.total,
    amountPaid: history.amountPaid,
    balanceDue: history.balanceDue,
    testReceiptUrl: `/api/backoffice/pos/receipt?id=${encodeURIComponent(history.id)}`,
    readbackUrl: `/api/backoffice/pos/neon-stage?orderId=${encodeURIComponent(history.id)}`,
  };
}
export async function dbk61ReadReceipt(id: string) {
  if (!isDbk61SyntheticOrderId(id)) throw new Error("Not a synthetic DBK-61 order");
  const row = await getDBK60TestOrder(id);
  return row ? dbk61TestReceipt(row as NeonTestOrder) : null;
}
export async function dbk61ReadHistory(filters: Dbk61HistoryFilter = {}) {
  // DBK-60 listing itself is capped at 25 and queries the isolated TEST branch.
  const previewRows = await listDBK60TestOrders();
  const orders = await Promise.all(previewRows.map(r=>getDBK60TestOrder(String(r.order_id))));
  return filterDbk61History(orders.filter((v): v is NonNullable<typeof v>=>Boolean(v))
    .map(o=>mapDbk61HistoryOrder(o as NeonTestOrder)),filters);
}
