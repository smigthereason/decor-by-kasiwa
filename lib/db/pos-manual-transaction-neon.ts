import 'server-only';
import { getNeonSql } from '@/lib/db/neon';

/**
 * DBK-57 — TEST-ONLY candidate manual POS transaction.
 * Not imported by live POS, checkout, callbacks, refunds or report routes.
 * This atomic test path does NOT prove any external payment is real.
 * Production cutover would also need historical reads/receipts, refund and
 * provider-specific payment flows completed first.
 */
export type DBK57ManualPosInput = {
  requestKey: string;
  cashierConfirmed: true;
  overpaymentApproved?: boolean;
  order: {
    orderId: string;
    orderNumber: string;
    channel: 'POS';
    storeId: string;
    sellerId: string;
    currency: 'KES';
    discountMinor: number;
    deliveryMinor: number;
    items: Array<{ productId: string; variantId?: string; storeId: string; quantity: number; unitPriceMinor: number }>;
  };
  payment: {
    orderId: string;
    provider: 'manual';
    providerReference: string;
    purpose: 'INITIAL';
    amountMinor: number;
    evidenceReference: string;
  };
};

const safeId = (v: string, min=1) => typeof v === 'string' && v.length>=min && v.length<=180;
const safeMoney = (n: number) => Number.isSafeInteger(n) && n>=0 && n<=1_000_000_000_000;

export async function recordTestNeonManualPosSale(input: DBK57ManualPosInput) {
  const u = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (process.env.DBK57_ISOLATED_MANUAL_TEST !== 'YES' ||
      process.env.DBK51_TEST_WRITE !== 'YES' ||
      !u || !process.env.DBK51_EXPECTED_TEST_HOST ||
      !process.env.DBK51_PRODUCTION_HOST ||
      process.env.DBK51_EXPECTED_TEST_HOST === process.env.DBK51_PRODUCTION_HOST ||
      u.hostname !== process.env.DBK51_EXPECTED_TEST_HOST ||
      u.hostname === process.env.DBK51_PRODUCTION_HOST) {
    throw new Error('DBK-57 is limited to the verified isolated Neon test branch.');
  }
  if (!safeId(input.requestKey,12) || input.requestKey.length>120 ||
      input.cashierConfirmed !== true ||
      !safeId(input.order.orderId) || !safeId(input.order.orderNumber) ||
      !safeId(input.order.storeId) || !safeId(input.order.sellerId) ||
      input.order.channel!=='POS' || input.order.currency!=='KES' ||
      input.payment.orderId!==input.order.orderId || input.payment.provider!=='manual' ||
      input.payment.purpose!=='INITIAL' || !safeId(input.payment.providerReference,5) ||
      !safeId(input.payment.evidenceReference,5) ||
      !safeMoney(input.payment.amountMinor) || input.payment.amountMinor===0 ||
      !safeMoney(input.order.discountMinor) || !safeMoney(input.order.deliveryMinor) ||
      !Array.isArray(input.order.items) || input.order.items.length<1 || input.order.items.length>100 ||
      input.order.items.some(v=>!safeId(v.productId) || v.storeId!==input.order.storeId ||
        (v.variantId!==undefined && (!safeId(v.variantId,0) || v.variantId==='__UNALLOCATED_VARIANT__')) ||
        !Number.isSafeInteger(v.quantity) || v.quantity<1 || v.quantity>1_000_000 || !safeMoney(v.unitPriceMinor))) {
    throw new Error('Invalid DBK-57 manual POS input');
  }
  const { requestKey, ...payload } = input;
  const result = await getNeonSql()`SELECT public.dbk57_record_manual_sale(
    ${requestKey}, ${JSON.stringify(payload)}::jsonb) AS result`;
  return result[0]?.result as Record<string, unknown>;
}
