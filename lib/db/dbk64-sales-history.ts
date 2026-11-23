import 'server-only';
import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { mapNeonOrder, type NeonOrderRow } from '@/lib/db/dbk65-online-fulfilment-core';
import type { PosHistoryOrder, SalesHistoryFilters } from '@/lib/pos/operations';
import { dbk134Enabled,dbk134RefundHistoryAmounts } from '@/lib/db/dbk134-online-operations';

// DBK131: read-only projection of the existing PAID online-checkout ledger.
// No Sanity writes, no payment capture, and no stock adjustments.
export async function dbk64ReadPaidSalesHistory(filters: SalesHistoryFilters = {}): Promise<PosHistoryOrder[]> {
  if (filters.channel === 'POS' ||
      (filters.cashier && !['online', 'online checkout'].includes(filters.cashier.toLowerCase()))) return [];
  if (process.env.DBK64_CUTOVER_APPROVED !== 'YES' ||
      !(process.env.DBK64_ONLINE_READS === 'YES' ||
        process.env.DBK64_ONLINE_SETTLEMENT === 'YES' ||
        process.env.DBK64_ONLINE_BACKEND === 'neon')) {
    throw new Error('DBK64 online sales-history reads are not enabled');
  }

  const sql = dbk62GetProductionSql(); // pinned to the verified Production Neon host
  const rows = await sql`SELECT o.order_id,o.order_number,o.reference,o.store_id,o.amount_minor,
       o.payment_status,o.stock_status,o.provider_transaction_id,o.created_at,o.updated_at,o.paid_at,o.snapshot,
       f.status AS fulfilment_status,f.updated_at AS fulfilment_updated_at,
       f.dispatched_at,f.dispatched_by_name,f.delivered_at
    FROM public.dbk64_online_orders o
    LEFT JOIN public.dbk65_online_fulfilment f ON f.order_id=o.order_id
    WHERE o.payment_status='PAID'
    ORDER BY coalesce(o.paid_at,o.created_at) DESC LIMIT 501`;
  if (rows.length > 500) throw new Error('DBK64 paid sales exceed 500 rows; add pagination before continuing');

  const refundAmounts=dbk134Enabled()?await dbk134RefundHistoryAmounts(rows.map(r=>String(r.order_id))):new Map<string,{processed:number;pending:number}>();
  const lowerQuery = filters.query?.trim().toLowerCase();
  const records: PosHistoryOrder[] = [];
  for (const raw of rows) {
    const row = raw as unknown as NeonOrderRow;
    const order = mapNeonOrder(row); // verifies identity, reference, total and snapshot
    if (filters.storeId && order.storeLocationId !== filters.storeId) continue;
    const soldAt = new Date(row.paid_at || row.created_at).toISOString();
    const kenyaDate = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Africa/Nairobi',
      year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(soldAt));
    if ((filters.from && kenyaDate < filters.from) || (filters.to && kenyaDate > filters.to)) continue;
    if (lowerQuery && ![order.orderNumber,order.paymentReference,order.customerName,
      order.customerEmail,order.customerPhone,order.providerReceiptNumber,
      ...order.lineItems.map(l=>l.name)].some(v=>String(v || '').toLowerCase().includes(lowerQuery))) continue;
    records.push({
      id: order.id, orderNumber: order.orderNumber, receiptNumber: row.reference,
      customerName: order.customerName, customerEmail: order.customerEmail,
      customerPhone: order.customerPhone, salesChannel: 'ONLINE',
      soldByName: 'Online', soldAt, paymentStatus: order.paymentStatus,
      paymentChannel: order.paymentChannel || 'paystack', subtotal: order.subtotal,
      discountAmount: 0, total: order.total, amountPaid: order.amountPaid ?? order.total,
      balanceDue: order.balanceDue ?? 0, cashTendered: 0, cashChangeDue: 0,
      deliveryFee: order.deliveryFee, deliveryLocation: order.deliveryLocation,
      refundedAmount: refundAmounts.get(order.id)?.processed || 0,
      pendingRefundAmount:refundAmounts.get(order.id)?.pending || 0, paymentReference: row.reference,
      paymentProvider: 'paystack', providerReceiptNumber: order.providerReceiptNumber || '',
      storeLocationId: order.storeLocationId, storeLocationName: order.storeLocationName,
      lineItems: order.lineItems.map(l=>({productId:l.productId,name:l.name,
        variantId:l.variantId,quantity:l.quantity,unitPrice:l.unitPrice})),
    });
  }
  return records.slice(0, Math.max(1, Math.min(500, filters.limit || 150)));
}
