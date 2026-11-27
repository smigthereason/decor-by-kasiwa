import "server-only";
import { dbk62GetProductionSql } from "@/lib/db/dbk62-pos-cutover";
import { kesMinor } from "@/lib/pos/dbk75-report-core";
import type { Order, OrderStatus } from "./types";

/** Compact read-only projections from the same production tables as DBK75.
 * No line-item, receipt, payment, or customer history joins are required.
 */
export async function dbk148ReadPaidOrders(storeNames: Map<string, string>): Promise<Order[]> {
  const sql = dbk62GetProductionSql();
  const rows = await sql`SELECT * FROM (
    SELECT o.order_id AS id, o.order_number, o.store_id, o.created_at,
      o.subtotal_minor::text AS subtotal, o.discount_minor::text AS discount, o.total_minor::text AS total, o.delivery_minor::text AS delivery,
      s.display_snapshot->>'internalReference' AS reference,
      s.display_snapshot->>'customerName' AS customer_name,
      s.display_snapshot->>'sellerName' AS seller_name, 'external' AS payment_channel,
      'POS' AS channel, 'paid' AS status
    FROM public.dbk62_manual_sales s JOIN public.dbk56_pos_orders o ON o.order_id=s.order_id
    WHERE o.financial_status='PAID' AND NOT EXISTS (
      SELECT 1 FROM public.dbk63_pos_refunds r WHERE r.order_id=o.order_id
      GROUP BY r.order_id HAVING sum(r.refund_minor)>=o.total_minor
    )
    UNION ALL
    SELECT o.order_id,o.order_number,o.store_id,o.created_at,
      o.snapshot->>'subtotalMinor',o.snapshot->>'discountMinor',o.amount_minor::text,coalesce(o.snapshot->>'deliveryMinor','0'),
      o.reference,o.snapshot->>'customerName',o.snapshot->>'sellerName','mobile_money','POS','paid'
    FROM public.dbk68_daraja_orders o WHERE o.payment_status='PAID'
    UNION ALL
    SELECT o.order_id,o.order_number,o.store_id,o.created_at,
      o.snapshot->>'subtotalMinor','0',o.amount_minor::text,coalesce(o.snapshot->>'deliveryMinor','0'),
      o.reference,o.snapshot->>'customerName','Online Shop',o.snapshot->>'paymentChannel','ONLINE',
      coalesce(f.status,'paid')
    FROM public.dbk64_online_orders o LEFT JOIN public.dbk65_online_fulfilment f ON f.order_id=o.order_id
    WHERE o.payment_status='PAID'
  ) paid_orders ORDER BY created_at DESC LIMIT 10001`;
  if (rows.length > 10000) throw new Error("Dashboard paid order limit exceeded; aggregate pagination required");
  const validStatuses: OrderStatus[] = ["pending","paid","processing","ready_for_store","picking","packed","dispatched","delivered","cancelled"];
  return rows.map(row => {
    const date = new Date(row.created_at).toISOString();
    const status: OrderStatus = validStatuses.includes(row.status as OrderStatus) ? row.status as OrderStatus : "paid";
    return {
      id: String(row.id), orderNumber: String(row.order_number), createdAt: date,
      customerId: "", customerName: row.customer_name || "Customer", customerEmail: "", customerPhone: "", deliveryLocation: "",
      status, paymentStatus: "paid", subtotal: kesMinor(row.subtotal), discountAmount: kesMinor(row.discount),
      total: kesMinor(row.total), deliveryFee: kesMinor(row.delivery), lineItems: [],
      salesChannel: row.channel === "POS" ? "POS" : "ONLINE", paymentReference: row.reference || undefined,
      paymentChannel: row.payment_channel || undefined, soldByName: row.seller_name || undefined,
      storeLocationId: row.store_id, storeLocationName: storeNames.get(row.store_id) || row.store_id,
    } satisfies Order;
  });
}
