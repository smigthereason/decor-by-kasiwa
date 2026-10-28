import "server-only";
import { neon } from "@neondatabase/serverless";
import type { DBK57ManualPosInput } from "@/lib/db/pos-manual-transaction-neon";

// This is a *persistent* TEST-BRANCH exercise, not a real sale. It never
// contacts the live Neon production database, Sanity writes, or a payment API.
const PINNED_TEST_HOST: string = "ep-green-sea-ba4sybzn-pooler.c-8.eu-central-1.aws.neon.tech";
const KNOWN_PRODUCTION_HOST: string = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";

export function dbk60TestSql() {
  if (process.env.NODE_ENV !== "development" ||
      process.env.DBK60_STAGING_TEST !== "YES" ||
      process.env.DBK60_TEST_WRITE !== "YES" ||
      process.env.DBK58_LOCAL_PREVIEW !== "YES" ||
      !process.env.DBK59_TEST_DATABASE_URL) {
    throw new Error("DBK-60 test stage disabled");
  }
  const url = new URL(process.env.DBK59_TEST_DATABASE_URL);
  const liveHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DBK-60 refuses non-PostgreSQL URL");
  }
  if (url.hostname === KNOWN_PRODUCTION_HOST ||
      url.hostname === liveHost ||
      url.hostname !== PINNED_TEST_HOST ||
      url.pathname !== "/neondb") {
    throw new Error("DBK-60 refuses database other than pinned isolated dbk51-test");
  }
  return neon(process.env.DBK59_TEST_DATABASE_URL);
}

export type DBK60DisplaySnapshot = {
  storeName: string;
  sellerName: string;
  productNames: string[];
};

export async function stageDBK60ManualSale(
  candidate: DBK57ManualPosInput,
  display: DBK60DisplaySnapshot,
) {
  if (!/^dbk58-manual-[0-9a-f]{24}$/.test(candidate.requestKey) ||
      candidate.cashierConfirmed !== true ||
      candidate.payment.provider !== "manual" ||
      !/^DBK58-TEST-[A-Z0-9-]{5,64}$/.test(candidate.payment.providerReference) ||
      candidate.payment.evidenceReference !== `synthetic-${candidate.requestKey.slice(-24)}` ||
      candidate.order.orderId !== `dbk58.order.${candidate.requestKey.slice(-24)}` ||
      candidate.order.orderNumber !== `DBK58-TEST-${candidate.requestKey.slice(-24)}` ||
      candidate.order.storeId.length === 0 ||
      !Array.isArray(candidate.order.items) ||
      candidate.order.items.length < 1 || candidate.order.items.length > 100 ||
      !Array.isArray(display.productNames) ||
      display.productNames.length !== candidate.order.items.length) {
    throw new Error("DBK-60 requires validated synthetic manual POS preview");
  }
  const { requestKey, ...payload } = candidate;
  const sql = dbk60TestSql();
  const rows = await sql`SELECT public.dbk60_stage_test_manual_sale(
    ${requestKey},${JSON.stringify(payload)}::jsonb,${JSON.stringify(display)}::jsonb) AS result`;
  const result = rows[0]?.result as Record<string, unknown> | undefined;
  if (!result || result.stockCommitted !== true || result.stageOnly !== true) {
    throw new Error("DBK-60 stage did not confirm TEST transaction");
  }
  return result;
}

export async function getDBK60TestOrder(orderId: string) {
  if (!/^dbk58[.]order[.][0-9a-f]{24}$/.test(orderId)) throw new Error("Invalid synthetic order ID");
  const sql = dbk60TestSql();
  const [orders, lines, payments] = await Promise.all([
    sql`SELECT o.order_id,o.order_number,o.store_id,o.seller_id,o.subtotal_minor,o.discount_minor,
      o.delivery_minor,o.total_minor,o.collected_minor,o.balance_due_minor,o.overpaid_minor,
      o.financial_status,o.created_at,s.display_snapshot
      FROM public.dbk60_staged_manual_sales s
      JOIN public.dbk56_pos_orders o ON o.order_id=s.order_id
      WHERE o.order_id=${orderId} LIMIT 1`,
    sql`SELECT l.line_number,l.product_id,l.variant_id,l.quantity,l.unit_price_minor,l.line_total_minor
      FROM public.dbk56_pos_order_lines l JOIN public.dbk60_staged_manual_sales s
      ON s.order_id=l.order_id WHERE l.order_id=${orderId} ORDER BY l.line_number`,
    sql`SELECT p.provider,p.provider_reference,p.payment_purpose,p.amount_minor,p.recorded_at
      FROM public.dbk56_pos_payments p JOIN public.dbk60_staged_manual_sales s
      ON s.order_id=p.order_id WHERE p.order_id=${orderId} ORDER BY p.recorded_at`,
  ]);
  return orders.length ? { ...orders[0], lines, payments, stageOnly: true, simulatedPayment: true } : null;
}

export async function listDBK60TestOrders() {
  const sql = dbk60TestSql();
  const rows = await sql`SELECT o.order_id,o.order_number,o.financial_status,o.total_minor,
    o.collected_minor,o.balance_due_minor,o.overpaid_minor,o.store_id,o.created_at,
    s.display_snapshot FROM public.dbk60_staged_manual_sales s
    JOIN public.dbk56_pos_orders o ON o.order_id=s.order_id
    ORDER BY o.created_at DESC LIMIT 25`;
  return rows;
}
