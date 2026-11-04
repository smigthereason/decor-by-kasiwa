import 'server-only';
import { createHash } from 'node:crypto';
import { getNeonSql } from '@/lib/db/neon';
import { serverClient } from '@/sanity/lib/serverClient';
import { dbk94NeonSalesEnabled, type Dbk94SaleMovement } from '@/lib/pos/dbk94-sales-movement';

/**
 * Project already-committed movement journal entries. This never adjusts stock.
 * The journal is written atomically with the Sanity order/stock mutation, so a
 * transient Neon outage does not lose or reverse a completed sale. Retrying is
 * idempotent, and a changed movement payload is rejected rather than overwritten.
 */
export async function dbk94ProjectOrder(orderId: string) {
  if (!dbk94NeonSalesEnabled()) return {disabled: true, projected: 0};
  if (!/^[-A-Za-z0-9_.]{4,180}$/.test(orderId)) throw new Error('Invalid DBK-94 order ID');
  const order = await serverClient.fetch<{
    _id: string; dbk94SaleMovementJournal?: Dbk94SaleMovement[];
  } | null>(
    `*[_type == 'commerceOrder' && _id == $id][0]{_id,dbk94SaleMovementJournal}`,
    {id: orderId}, {cache:'no-store'},
  );
  if (!order) throw new Error('DBK-94 order journal missing');
  const entries = order.dbk94SaleMovementJournal || [];
  if (entries.length > 200) throw new Error('DBK-94 journal exceeds limit');
  const ids = new Set<string>();
  const sql = getNeonSql();
  for (const entry of entries) {
    if (entry.orderId !== orderId ||
        !entry.movementId?.startsWith('inventoryMovement.') ||
        !entry.productId || !Number.isSafeInteger(entry.quantityChange) ||
        entry.quantityChange >= 0 || entry.quantityChange < -1000000 ||
        !entry.createdAt || ids.has(entry.movementId)) {
      throw new Error('DBK-94 invalid or duplicate movement evidence');
    }
    ids.add(entry.movementId);
    // Stable serialization: existing journals are immutable. Never update a
    // previously projected movement to hide a mismatch.
    const payload = JSON.stringify(entry);
    const digest = createHash('sha256').update(payload).digest('hex');
    await sql`INSERT INTO public.dbk94_sale_movements
      (movement_id,order_id,entry_sha256,movement_json)
      VALUES (${entry.movementId},${orderId},${digest},${payload}::jsonb)
      ON CONFLICT (movement_id) DO NOTHING`;
    const rows = await sql`SELECT order_id,entry_sha256 FROM public.dbk94_sale_movements
      WHERE movement_id=${entry.movementId}`;
    if (rows.length !== 1 || rows[0].order_id !== orderId || rows[0].entry_sha256 !== digest) {
      throw new Error('DBK-94 Neon replay conflict: production reconciliation required');
    }
  }
  return {disabled:false,projected:entries.length};
}

/** Never signal an already committed sale as unpaid because projection is down. */
export async function dbk94ProjectAfterCommit(orderId:string) {
  if (!dbk94NeonSalesEnabled()) return;
  try {
    await dbk94ProjectOrder(orderId);
  } catch (cause) {
    console.error('[DBK94] SALE_JOURNAL_NEEDS_REPLAY', {orderId,
      reason:cause instanceof Error?cause.message:'unknown'});
  }
}
