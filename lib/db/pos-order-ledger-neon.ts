import 'server-only';
import { getNeonSql } from '@/lib/db/neon';

/**
 * DBK-56 TEST-ONLY candidate ledger. Not imported by any live POS, webhook,
 * checkout, refund or reports route. Order writes are not stock deductions.
 * Provider proof must be verified outside this module before future live use.
 */
type OrderLine = {
  productId: string;
  variantId?: string;
  storeId: string;
  quantity: number;
  unitPriceMinor: number;
};
export type NeonLedgerOrder = {
  requestKey: string;
  orderId: string;
  orderNumber: string;
  channel: 'POS' | 'ONLINE';
  storeId: string;
  sellerId: string;
  currency: 'KES';
  deliveryMinor: number;
  discountMinor: number;
  items: OrderLine[];
};
export type NeonLedgerPayment = {
  eventKey: string;
  orderId: string;
  provider: 'cash' | 'manual' | 'daraja' | 'paystack';
  providerReference: string;
  purpose: 'INITIAL' | 'RECEIVABLE';
  amountMinor: number;
  evidenceReference: string;
};
function requireDBK56Cutover() {
  if (process.env.DBK_POS_LEDGER_BACKEND !== 'neon' ||
      process.env.DBK_POS_LEDGER_CUTOVER !== 'confirmed' ||
      process.env.DBK_INVENTORY_BACKEND !== 'neon' ||
      process.env.DBK_INVENTORY_BASKET_CUTOVER !== 'confirmed' ||
      process.env.DBK_POS_SETTLEMENT_CUTOVER !== 'confirmed') {
    throw new Error('DBK-56 order ledger disabled. Sanity remains authoritative.');
  }
}
const money = (v: number) => Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000_000;
const id = (v: string, min = 1) => typeof v === 'string' && v.length >= min && v.length <= 180;
export async function createNeonPosLedgerOrder(input: NeonLedgerOrder) {
  requireDBK56Cutover();
  if (!id(input.requestKey, 12) || !id(input.orderId) || !id(input.orderNumber) ||
      !id(input.sellerId) || !id(input.storeId) || input.storeId === '__UNALLOCATED__' ||
      !['POS','ONLINE'].includes(input.channel) || input.currency !== 'KES' ||
      !money(input.discountMinor) || !money(input.deliveryMinor) ||
      !Array.isArray(input.items) || !input.items.length || input.items.length>100 ||
      input.items.some(v => !id(v.productId) || !id(v.storeId) || v.storeId !== input.storeId ||
        (v.variantId !== undefined && (!id(v.variantId,0) || v.variantId==='__UNALLOCATED_VARIANT__')) ||
        !Number.isSafeInteger(v.quantity) || v.quantity <= 0 || v.quantity>1_000_000 ||
        !money(v.unitPriceMinor))) {
    throw new Error('Invalid DBK-56 order input');
  }
  const { requestKey, ...payload } = input;
  const data = await getNeonSql()`SELECT public.dbk56_create_pos_order(
    ${requestKey},${JSON.stringify(payload)}::jsonb) AS result`;
  return data[0]?.result as Record<string, unknown>;
}
export async function recordNeonPosLedgerPayment(input: NeonLedgerPayment) {
  requireDBK56Cutover();
  if (!id(input.eventKey,12) || !id(input.orderId) ||
      !id(input.providerReference,5) || !id(input.evidenceReference,5) ||
      !['cash','manual','daraja','paystack'].includes(input.provider) ||
      !['INITIAL','RECEIVABLE'].includes(input.purpose) ||
      !money(input.amountMinor) || input.amountMinor === 0) {
    throw new Error('Invalid DBK-56 payment input');
  }
  const { eventKey, ...payload } = input;
  const data = await getNeonSql()`SELECT public.dbk56_record_pos_payment(
    ${eventKey},${JSON.stringify(payload)}::jsonb) AS result`;
  return data[0]?.result as Record<string, unknown>;
}
