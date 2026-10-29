import 'server-only';
import { neon } from '@neondatabase/serverless';
import { prepareDBK62ManualSale, type PosSaleInput, type PosSeller } from '@/lib/pos/server';
import {
  isDbk62RealOrderId, mapDBK62History, mapDBK62Receipt, filterDBK62History,
  type RealNeonOrder,
} from '@/lib/db/dbk62-pos-mapper';

const PRODUCTION_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const TEST_HOST = 'ep-green-sea-ba4sybzn-pooler.c-8.eu-central-1.aws.neon.tech';

export function dbk62CutoverRequested() {
  return process.env.DBK62_POS_BACKEND === 'neon';
}
/** Independent read switch preserves receipts during any controlled write rollback. */
export function dbk62ReadEnabled() {
  return dbk62CutoverRequested() || process.env.DBK62_NEON_READS === 'YES';
}
export function dbk62GetProductionSql() {
  // App and database both fail closed. Setting the feature flag alone does not enable transactions.
  if (!dbk62ReadEnabled() || process.env.DBK62_CUTOVER_APPROVED !== 'YES') {
    throw new Error('DBK-62 real POS cutover is disabled');
  }
  const raw=process.env.DATABASE_URL;
  if (!raw) throw new Error('DBK-62 requires production DATABASE_URL');
  const u=new URL(raw);
  if (!['postgres:','postgresql:'].includes(u.protocol) ||
      u.hostname===TEST_HOST || u.hostname!==PRODUCTION_HOST || u.pathname!=='/neondb') {
    throw new Error('DBK-62 refuses non-production Neon database');
  }
  return neon(raw);
}

export async function dbk62ReadRealOrder(id:string):Promise<RealNeonOrder|null> {
  if (!isDbk62RealOrderId(id)) return null;
  const sql=dbk62GetProductionSql();
  const rows=await sql`SELECT o.order_id,o.order_number,o.store_id,o.seller_id,o.subtotal_minor,
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
    WHERE o.order_id=${id} LIMIT 1`;
  return (rows[0] as unknown as RealNeonOrder)||null;
}
export async function dbk62ListRealOrders():Promise<RealNeonOrder[]> {
  const sql=dbk62GetProductionSql();
  const rows=await sql`SELECT o.order_id,o.order_number,o.store_id,o.seller_id,o.subtotal_minor,
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
    ORDER BY o.created_at DESC LIMIT 500`;
  return rows as unknown as RealNeonOrder[];
}
export async function dbk62CreateRealManualSale(input:PosSaleInput,seller:PosSeller) {
  if (!dbk62CutoverRequested()) throw new Error('DBK-62 real POS writes are disabled');
  const sql=dbk62GetProductionSql();
  const prepared=await prepareDBK62ManualSale(input,seller);
  const {requestKey,...payload}=prepared.candidate;
  const rows=await sql`SELECT public.dbk62_record_real_manual_sale(${requestKey},
    ${JSON.stringify(payload)}::jsonb,${JSON.stringify(prepared.snapshot)}::jsonb) AS result`;
  const result=rows[0]?.result as Record<string,unknown>|undefined;
  if (!result || result.stockCommitted!==true) throw new Error('Neon POS sale did not commit atomically');
  const persisted=await dbk62ReadRealOrder(prepared.candidate.order.orderId);
  if (!persisted) throw new Error('Neon sale committed but receipt readback failed; reconcile before retrying');
  const h=mapDBK62History(persisted);
  return {
    orderId:h.id,orderNumber:h.orderNumber,receiptNumber:h.receiptNumber,
    reference:h.paymentReference,status:'completed',paymentStatus:h.paymentStatus,
    paymentChannel:h.paymentChannel,providerReceiptNumber:h.providerReceiptNumber,
    subtotal:h.subtotal,discountAmount:h.discountAmount,total:h.total,
    amountPaid:h.amountPaid,balanceDue:h.balanceDue,cashTendered:h.cashTendered,
    cashChangeDue:h.cashChangeDue,deliveryFee:h.deliveryFee,deliveryLocation:h.deliveryLocation,
    soldByName:h.soldByName,soldAt:h.soldAt,replayed:result.replayed===true,
    displayText:'Manual payment recorded against the cashier-confirmed reference; not independently verified with Safaricom.',
  };
}
export async function dbk62ReadHistory(filters:Parameters<typeof filterDBK62History>[1]) {
  return filterDBK62History((await dbk62ListRealOrders()).map(mapDBK62History),filters);
}
export async function dbk62ReadReceipt(id:string) {
  const row=await dbk62ReadRealOrder(id);
  return row?mapDBK62Receipt(row):null;
}
