import 'server-only';
import { getNeonSql } from '@/lib/db/neon';

/**
 * DBK-51 PostgreSQL inventory engine. Intentionally NOT wired into POS/API
 * handlers: Sanity remains authoritative until the coordinated cutover.
 * The DB also enforces a writes_enabled=false default safety gate.
 */
export type NeonStockOperation = {
  operationId: string;
  type: 'PURCHASE' | 'RECEIVE' | 'TRANSFER' | 'SALE' | 'RETURN';
  productId: string;
  variantId?: string;
  quantity: number;
  sourceStoreId?: string;
  destinationStoreId?: string;
  orderId?: string;
};

export async function applyNeonStockOperation(operation: NeonStockOperation) {
  if (process.env.DBK_INVENTORY_BACKEND !== 'neon') {
    throw new Error('Neon inventory cutover is not enabled. Sanity stock remains authoritative.');
  }
  if (!operation.operationId || !operation.productId ||
      !Number.isSafeInteger(operation.quantity) || operation.quantity <= 0) {
    throw new Error('Invalid stock operation');
  }
  const { operationId, ...payload } = operation;
  const rows = await getNeonSql()`
    SELECT public.dbk51_apply_stock(${operationId}, ${JSON.stringify(payload)}::jsonb) AS result
  `;
  return rows[0]?.result as Record<string, unknown>;
}

export async function readNeonStockBalance(productId: string, variantId = '', storeId?: string) {
  const sql = getNeonSql();
  if (!storeId) {
    return sql`SELECT product_id,variant_id,location_id,on_hand,incoming,updated_at
      FROM public.dbk51_stock_balances
      WHERE product_id=${productId} AND variant_id=${variantId}
      ORDER BY location_id`;
  }
  return sql`SELECT product_id,variant_id,location_id,on_hand,incoming,updated_at
    FROM public.dbk51_stock_balances
    WHERE product_id=${productId} AND variant_id=${variantId} AND location_id=${storeId}`;
}

/**
 * DBK-54: atomic multi-line stock writer, intentionally not called by live POS,
 * online-payment confirmation, or refunds until their order/payment lifecycle
 * is migrated. Both explicit flags are required in addition to the DB gate.
 */
export type NeonStockBasket = {
  batchId: string;
  type: 'SALE' | 'RETURN';
  orderId: string;
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    sourceStoreId?: string;
    destinationStoreId?: string;
  }>;
};

export async function applyNeonStockBasket(batch: NeonStockBasket) {
  if (process.env.DBK_INVENTORY_BACKEND !== 'neon' ||
      process.env.DBK_INVENTORY_BASKET_CUTOVER !== 'confirmed') {
    throw new Error('DBK-54 stock basket cutover disabled: Sanity remains authoritative.');
  }
  if (!batch.batchId || batch.batchId.length < 8 || batch.batchId.length > 120 ||
      !batch.orderId || !['SALE','RETURN'].includes(batch.type) ||
      !Array.isArray(batch.items) || !batch.items.length || batch.items.length > 100 ||
      batch.items.some(line => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        (batch.type === 'SALE' && (!line.sourceStoreId || line.sourceStoreId === '__UNALLOCATED__')) ||
        (batch.type === 'RETURN' && (!line.destinationStoreId || line.destinationStoreId === '__UNALLOCATED__')))) {
    throw new Error('Invalid DBK-54 stock basket');
  }
  const {batchId, ...payload} = batch;
  const result = await getNeonSql()`
    SELECT public.dbk54_apply_stock_batch(${batchId}, ${JSON.stringify(payload)}::jsonb) AS result
  `;
  return result[0]?.result as Record<string, unknown>;
}
