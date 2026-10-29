import 'server-only';

import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { dbk64ValidReference } from '@/lib/db/dbk64-online-core';

/** DBK-64 deliberately has no test-branch fallback and no Sanity write path. */
export function dbk64OnlineRequested(): boolean {
  return process.env.DBK64_ONLINE_BACKEND === 'neon';
}

function getSql(operation: 'create' | 'settle' | 'read' = 'create') {
  // Stopping new checkouts must not prevent settlement of payments already sent
  // to Paystack. An independent callback gate can stay active during recovery.
  const enabled = operation === 'create' ? dbk64OnlineRequested()
    : operation === 'settle' ? (dbk64OnlineRequested() || process.env.DBK64_ONLINE_SETTLEMENT === 'YES')
    : (dbk64OnlineRequested() || process.env.DBK64_ONLINE_SETTLEMENT === 'YES' || process.env.DBK64_ONLINE_READS === 'YES');
  if (!enabled || process.env.DBK64_CUTOVER_APPROVED !== 'YES') {
    throw new Error('DBK-64 online checkout/settlement is disabled');
  }
  // DBK-62 pins the real production hostname, requires its independent approval
  // and refuses the isolated test database.
  return dbk62GetProductionSql();
}

export type DBK64CheckoutLine = {
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceMinor: number;
  name: string;
  finish?: string;
  size?: string;
};
export type DBK64CheckoutSnapshot = {
  orderId: string;
  orderNumber: string;
  reference: string;
  storeId: string;
  storeName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentChannel: string;
  subtotalMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  deliveryAddress: {
    fullName: string; phone: string; address1: string; address2?: string;
    city: string; region: string; country: string;
  };
  deliveryLocation: string;
  lines: DBK64CheckoutLine[];
};


export async function dbk64CreatePending(snapshot: DBK64CheckoutSnapshot) {
  const sql = getSql();
  if (!dbk64ValidReference(snapshot.reference) ||
      snapshot.orderId !== `dbk64.order.${snapshot.reference}` ||
      snapshot.totalMinor <= 0 || !Number.isSafeInteger(snapshot.totalMinor) ||
      snapshot.totalMinor !== snapshot.subtotalMinor + snapshot.deliveryMinor ||
      snapshot.lines.length === 0 || snapshot.lines.length > 100) {
    throw new Error('DBK-64 checkout snapshot failed validation');
  }
  const rows = await sql`SELECT public.dbk64_create_pending_checkout(
    ${snapshot.reference}, ${JSON.stringify(snapshot)}::jsonb
  ) AS result`;
  const result = rows[0]?.result as { created?: boolean } | undefined;
  if (!result || result.created !== true) throw new Error('Failed to persist Neon pending checkout');
}

export async function dbk64MarkInitFailed(reference: string) {
  const sql = getSql('settle');
  await sql`UPDATE public.dbk64_online_orders SET payment_status='INIT_FAILED', updated_at=now()
    WHERE reference=${reference} AND payment_status='PENDING'`;
}

type DBK64PersistedOrder = {
  reference: string;
  order_id: string;
  payment_status: string;
  stock_status: string;
  amount_minor: string | number;
  provider_transaction_id: string | null;
  snapshot: DBK64CheckoutSnapshot;
};

export async function dbk64GetPending(reference: string): Promise<DBK64PersistedOrder | null> {
  const sql = getSql('read');
  if (!dbk64ValidReference(reference)) throw new Error('Invalid DBK-64 payment reference');
  const rows = await sql`SELECT reference,order_id,payment_status,stock_status,
     amount_minor,provider_transaction_id,snapshot
     FROM public.dbk64_online_orders WHERE reference=${reference} LIMIT 1`;
  return (rows[0] as unknown as DBK64PersistedOrder) || null;
}

export type DBK64VerifiedPayment = {
  reference: string;
  id: string;
  amountMinor: number;
  currency: string;
  paidAt: string;
  channel: string;
};

export async function dbk64RecordVerifiedPayment(payment: DBK64VerifiedPayment) {
  const sql = getSql('settle');
  const rows = await sql`SELECT public.dbk64_finalize_verified_checkout(
    ${payment.reference},${JSON.stringify(payment)}::jsonb) AS result`;
  const result = rows[0]?.result as {
    paymentStatus?: string; stockStatus?: string; replayed?: boolean;
  } | undefined;
  if (result?.paymentStatus !== 'PAID' || !['COMMITTED', 'REVIEW_REQUIRED'].includes(result.stockStatus || '')) {
    throw new Error('Provider payment was verified but Neon settlement must be reconciled');
  }
  return result;
}


/** Admin-only operational readback; pending or paid stock exceptions must be visible. */
export async function dbk64ListOperationalOrders(limit = 100) {
  const sql = getSql('read');
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error('Invalid DBK-64 history limit');
  }
  const rows = await sql`SELECT order_id,order_number,reference,store_id,amount_minor,
    payment_status,stock_status,provider_transaction_id,created_at,paid_at,
    snapshot->>'customerName' AS customer_name,
    snapshot->>'customerPhone' AS customer_phone
    FROM public.dbk64_online_orders ORDER BY created_at DESC LIMIT ${limit}`;
  return rows;
}
