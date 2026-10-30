/**
 * DBK-75: read-only Neon source for unified sales reporting.
 * Intentionally does not call any settlement or stock function.
 * A missing/invalid row fails the entire report instead of hiding revenue.
 */
import 'server-only';
import { neon } from '@neondatabase/serverless';
import { mapDBK62History, type RealNeonOrder } from '@/lib/db/dbk62-pos-mapper';
import { dbk68Summary, dbk68Kes, type DBK68Order } from '@/lib/db/dbk68-daraja-core';
import { mapNeonOrder, type NeonOrderRow } from '@/lib/db/dbk65-online-fulfilment-core';
import { kesMinor, requireCompletePage, withinWindow } from '@/lib/pos/dbk75-report-core';
import type { PosHistoryOrder } from '@/lib/pos/operations';

const PROD_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const MAX_ROWS = 5000;
export type NeonReportReturn = {amount: number; restock: boolean; items: Array<{productId:string;quantity:number;unitCost?:number}>};

export function dbk75NeonReportsRequested() {
  return process.env.DBK75_NEON_REPORT_READS === 'YES' || process.env.DBK62_POS_BACKEND === 'neon';
}
function getReadSql() {
  if (!dbk75NeonReportsRequested()) throw new Error('DBK-75 report read path is disabled');
  if (!process.env.DATABASE_URL) throw new Error('DBK-75 production connection not configured');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== PROD_HOST ||
      decodeURIComponent(url.pathname.slice(1)) !== 'neondb') {
    throw new Error('DBK-75 production DB identity mismatch');
  }
  return neon(process.env.DATABASE_URL);
}

export async function dbk75ReadNeonReport(start:string,end:string,storeId:string|null) {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(start) > Date.parse(end)) {
    throw new Error('DBK-75 invalid date range');
  }
  const sql=getReadSql();
  // Source-specific disjoint identifiers prevent Sanity/Neon double counting.
  // Query one extra record: truncation is a hard failure, never a silent report omission.
  const [manual, daraja, online, refunds, receivables] = await Promise.all([
    sql`SELECT o.order_id,o.order_number,o.store_id,o.seller_id,o.subtotal_minor,
      o.discount_minor,o.delivery_minor,o.total_minor,o.collected_minor,o.balance_due_minor,
      o.overpaid_minor,o.financial_status,o.created_at,s.display_snapshot,
      COALESCE((SELECT sum(r.refund_minor) FROM public.dbk63_pos_refunds r
        WHERE r.order_id=o.order_id),0) AS refunded_minor,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('product_id',l.product_id,'variant_id',l.variant_id,
        'quantity',l.quantity,'unit_price_minor',l.unit_price_minor) ORDER BY l.line_number)
        FROM public.dbk56_pos_order_lines l WHERE l.order_id=o.order_id),'[]'::jsonb) AS lines,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',p.provider,'provider_reference',p.provider_reference,
        'payment_purpose',p.payment_purpose,'amount_minor',p.amount_minor,
        'event_key',p.event_key,'recorded_at',p.recorded_at) ORDER BY p.recorded_at)
        FROM public.dbk56_pos_payments p WHERE p.order_id=o.order_id),'[]'::jsonb) AS payments
      FROM public.dbk62_manual_sales s JOIN public.dbk56_pos_orders o ON o.order_id=s.order_id
      WHERE o.created_at >= ${start}::timestamptz AND o.created_at <= ${end}::timestamptz
        AND (${storeId}::text IS NULL OR o.store_id=${storeId})
      ORDER BY o.created_at DESC LIMIT ${MAX_ROWS+1}`,
    sql`SELECT * FROM public.dbk68_daraja_orders
      WHERE created_at >= ${start}::timestamptz AND created_at <= ${end}::timestamptz
        AND (${storeId}::text IS NULL OR store_id=${storeId})
      ORDER BY created_at DESC LIMIT ${MAX_ROWS+1}`,
    sql`SELECT o.order_id,o.order_number,o.reference,o.store_id,o.amount_minor,
      o.payment_status,o.stock_status,o.provider_transaction_id,o.created_at,o.updated_at,o.paid_at,o.snapshot,
      f.status AS fulfilment_status,f.updated_at AS fulfilment_updated_at,
      f.dispatched_at,f.dispatched_by_name,f.delivered_at
      FROM public.dbk64_online_orders o LEFT JOIN public.dbk65_online_fulfilment f ON f.order_id=o.order_id
      WHERE o.created_at >= ${start}::timestamptz AND o.created_at <= ${end}::timestamptz
        AND (${storeId}::text IS NULL OR o.store_id=${storeId})
      ORDER BY o.created_at DESC LIMIT ${MAX_ROWS+1}`,
    sql`SELECT r.order_id,r.refund_minor,r.restock,r.items,r.recorded_at
      FROM public.dbk63_pos_refunds r
      JOIN public.dbk56_pos_orders o ON o.order_id=r.order_id
      WHERE r.recorded_at >= ${start}::timestamptz AND r.recorded_at <= ${end}::timestamptz
        AND (${storeId}::text IS NULL OR o.store_id=${storeId})
      ORDER BY r.recorded_at DESC LIMIT ${MAX_ROWS+1}`,
    sql`SELECT coalesce(sum(balance_due_minor),0) AS due
      FROM public.dbk56_pos_orders o JOIN public.dbk62_manual_sales s ON s.order_id=o.order_id
      WHERE (${storeId}::text IS NULL OR o.store_id=${storeId})`,
  ]);
  for (const [label,rows] of [['manual',manual],['daraja',daraja],['online',online],['refunds',refunds]] as const) {
    requireCompletePage(rows.length,MAX_ROWS,label);
  }
  const orders:PosHistoryOrder[]=[];
  let failedPayments=0,pendingPayments=0;
  for (const raw of manual) {
    const row=raw as unknown as RealNeonOrder;
    const h=mapDBK62History(row);
    if (['paid','partially_paid','refunded'].includes(h.paymentStatus)) orders.push(h);
    else if (h.paymentStatus==='pending') pendingPayments++;
    else throw new Error('DBK-75 unrecognized manual POS payment state');
  }
  for (const raw of daraja) {
    const row=raw as unknown as DBK68Order;
    const summary=dbk68Summary(row);
    if (row.payment_status==='FAILED'||row.payment_status==='INIT_FAILED') failedPayments++;
    else if (row.payment_status!=='PAID') pendingPayments++;
    if (row.payment_status!=='PAID') continue;
    if (row.stock_status!=='COMMITTED') throw new Error('DBK-75 paid M-Pesa stock review unresolved');
    orders.push({id:summary.orderId,orderNumber:summary.orderNumber,receiptNumber:summary.receiptNumber,
      customerName:summary.customerName,customerPhone:summary.customerPhone,customerEmail:'',
      salesChannel:'POS',soldByName:summary.soldByName,soldAt:new Date(row.created_at).toISOString(),paymentStatus:'paid',
      paymentChannel:'mobile_money',subtotal:dbk68Kes(row.snapshot.subtotalMinor),
      discountAmount:dbk68Kes(row.snapshot.discountMinor),total:summary.total,amountPaid:summary.amountPaid,
      balanceDue:summary.balanceDue,cashTendered:0,cashChangeDue:0,deliveryFee:0,deliveryLocation:'',
      refundedAmount:0,paymentReference:summary.reference,paymentProvider:'daraja',
      providerReceiptNumber:row.receipt_number||'',storeLocationId:row.store_id,storeLocationName:'',
      lineItems:summary.lineItems});
  }
  for (const raw of online) {
    const row=raw as unknown as NeonOrderRow;
    const order=mapNeonOrder(row);
    if (row.payment_status==='INIT_FAILED') failedPayments++;
    else if (row.payment_status==='PENDING') pendingPayments++;
    if (row.payment_status!=='PAID') continue;
    if (row.stock_status!=='COMMITTED') throw new Error('DBK-75 paid Paystack stock review unresolved');
    orders.push({id:order.id,orderNumber:order.orderNumber,receiptNumber:`RCT-${order.orderNumber}`,
      customerName:order.customerName,customerPhone:order.customerPhone,customerEmail:order.customerEmail,
      salesChannel:'ONLINE',soldByName:'Online Shop',soldAt:new Date(row.created_at).toISOString(),
      paymentStatus:'paid',paymentChannel:order.paymentChannel||'',subtotal:order.subtotal,
      discountAmount:0,total:order.total,amountPaid:order.total,balanceDue:0,
      cashTendered:0,cashChangeDue:0,deliveryFee:order.deliveryFee,deliveryLocation:order.deliveryLocation,
      refundedAmount:0,paymentReference:row.reference,paymentProvider:'paystack',
      providerReceiptNumber:row.provider_transaction_id||'',storeLocationId:row.store_id,
      storeLocationName:order.storeLocationName,
      lineItems:row.snapshot.lines.map(l=>({productId:l.productId,name:l.name,
        variantId:l.variantId,quantity:l.quantity,unitPrice:kesMinor(l.unitPriceMinor)}))});
  }
  const refundRows:NeonReportReturn[]=refunds.map(raw=>{
    const minor=kesMinor(raw.refund_minor as number|string);
    const items=raw.items as Array<{productId:string;quantity:number}>;
    if (!Array.isArray(items)) throw new Error('DBK-75 malformed refund items');
    return {amount:minor,restock:raw.restock===true,items:items.map(l=>({productId:l.productId,quantity:l.quantity}))};
  });
  const due=kesMinor(receivables[0]?.due as number|string);
  // Explicit limit and distinct source identity ensure reports cannot silently omit an order.
  for (const order of orders) if (!withinWindow(order.soldAt,start,end)) {
    throw new Error('DBK-75 source order timestamp outside report range');
  }
  return {orders,refundRows,outstandingReceivables:due,failedPayments,pendingPayments};
}
