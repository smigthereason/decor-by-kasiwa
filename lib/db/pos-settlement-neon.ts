import 'server-only';
import { getNeonSql } from '@/lib/db/neon';

/**
 * DBK-55 staged paid-POS ledger. Intentionally UNUSED by live API handlers.
 * NEVER call until verified payment callbacks, orders, inventory reads and
 * authorized recovery are migrated together. Sanity is currently authoritative.
 */
export type NeonPaidPosSettlement = {
  eventKey: string;
  orderId: string;
  provider: 'daraja' | 'paystack' | 'manual';
  providerPaymentId: string;
  providerReceipt?: string;
  amountMinor: number;
  currency: 'KES';
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
    sourceStoreId: string;
  }>;
};

function requireCutoverPermission() {
  if (process.env.DBK_POS_LEDGER_BACKEND !== 'neon' ||
      process.env.DBK_POS_SETTLEMENT_CUTOVER !== 'confirmed' ||
      process.env.DBK_INVENTORY_BACKEND !== 'neon' ||
      process.env.DBK_INVENTORY_BASKET_CUTOVER !== 'confirmed') {
    throw new Error('DBK-55 POS settlement disabled; Sanity remains authoritative.');
  }
}

export async function recordPaidPosSettlement(input: NeonPaidPosSettlement) {
  requireCutoverPermission();
  if (!input.eventKey || input.eventKey.length < 12 || input.eventKey.length > 180 ||
      !input.orderId || !['daraja','paystack','manual'].includes(input.provider) ||
      !input.providerPaymentId || !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0 || input.currency !== 'KES' ||
      !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100 ||
      input.items.some(item => !item.productId || !item.sourceStoreId ||
        item.sourceStoreId === '__UNALLOCATED__' || item.variantId === '__UNALLOCATED_VARIANT__' ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1)) {
    throw new Error('Invalid DBK-55 confirmed POS settlement');
  }
  const { eventKey, ...payload } = input;
  const result = await getNeonSql()`
    SELECT public.dbk55_record_paid_pos(${eventKey},${JSON.stringify(payload)}::jsonb) AS result
  `;
  return result[0]?.result as {
    orderId: string;
    financialStatus: 'PAID';
    stockStatus: 'COMMITTED' | 'REVIEW_REQUIRED';
    inventoryReviewRequired: boolean;
    replayed: boolean;
  };
}

/** Requires future manager-only authorization at the route level. Not wired. */
export async function retryPaidPosInventoryAfterReview(orderId: string) {
  requireCutoverPermission();
  if (!orderId || orderId.length > 180) throw new Error('Invalid POS order ID');
  const result = await getNeonSql()`
    SELECT public.dbk55_retry_paid_pos_stock(${orderId}) AS result
  `;
  return result[0]?.result as Record<string, unknown>;
}
