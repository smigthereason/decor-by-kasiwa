/** DBK-36 production importer contract. Pure validation: no IO, payment, or writes. */
export type PaidSource = {
  wa_id: string; reference: string; status: string; amount_kes: number | string;
  receipt: string | null; checkout_id: string | null; merchant_id: string | null;
  paid_at: string | Date | null; cart_json: unknown;
};
export type InventoryBalance = {
  product_id: string; variant_id: string; location_id: string; on_hand: number | string;
};
export type ProductPrice = {
  id: string; price: number; available?: boolean; ecommerceEnabled?: boolean;
  variants?: { id: string; price?: number }[];
  wholesaleMinQuantity?: number; wholesalePrice?: number;
};
export type MappedLine = {
  productId: string; variantId: string; quantity: number; unitPriceMinor: number;
};
const REF = /^DBKWA[A-Z0-9]{7}$/;
const RECEIPT = /^[A-Za-z0-9-]{6,30}$/;
const PHONE = /^254(?:7|1)\d{8}$/;
const toMinor = (v: number): number | null => {
  const n = v * 100;
  return Number.isFinite(n) && Number.isSafeInteger(Math.round(n)) && Math.abs(n-Math.round(n)) < 0.000001
    ? Math.round(n) : null;
};
export function mapVerifiedPaidOrder(
  paid: PaidSource, products: ProductPrice[], balances: InventoryBalance[], storeId: string,
  requestedVariants: Record<string,string> = {},
): {ok: true; amountMinor: number; lines: MappedLine[]} | {ok: false; blockers: string[]} {
  const blockers: string[] = [];
  if (!REF.test(String(paid.reference))) blockers.push('REFERENCE_INVALID');
  if (!PHONE.test(String(paid.wa_id))) blockers.push('CUSTOMER_PHONE_INVALID');
  if (paid.status !== 'paid' || !paid.checkout_id || !paid.merchant_id || !paid.paid_at ||
      !RECEIPT.test(String(paid.receipt || ''))) blockers.push('PROVIDER_PAYMENT_EVIDENCE_MISSING');
  const kes = Number(paid.amount_kes);
  // This importer handles the previously approved capped pilot. A new multi-customer
  // order-level payment schema must replace it before removing the cap.
  if (!Number.isSafeInteger(kes) || kes < 1 || kes > 500) blockers.push('LEGACY_PILOT_AMOUNT_UNSUPPORTED');
  if (!/^[A-Za-z0-9._:-]{2,180}$/.test(storeId) || storeId === '__UNALLOCATED__')
    blockers.push('SOURCE_STORE_INVALID');
  if (!Array.isArray(paid.cart_json) || paid.cart_json.length < 1 || paid.cart_json.length > 12)
    blockers.push('PAID_CART_INVALID');
  const lines: MappedLine[] = [];
  const seen = new Set<string>();
  let sum = 0;
  for (const item of Array.isArray(paid.cart_json) ? paid.cart_json : []) {
    if (!item || typeof item !== 'object') { blockers.push('CART_LINE_INVALID'); continue; }
    const entry = item as Record<string,unknown>;
    const id = typeof entry.productId === 'string' ? entry.productId : '';
    const quantity = entry.quantity;
    const subtotal = entry.subtotal;
    if (!id || id.length > 180 || !Number.isSafeInteger(quantity) || (quantity as number) < 1 ||
        (quantity as number) > 20 || typeof subtotal !== 'number' || toMinor(subtotal) === null || subtotal <= 0) {
      blockers.push('CART_LINE_INVALID'); continue;
    }
    const qty = quantity as number;
    const subtotalMinor = toMinor(subtotal)!;
    if (subtotalMinor % qty !== 0) { blockers.push('NON_INTEGER_UNIT_PRICE'); continue; }
    if (seen.has(id)) { blockers.push('DUPLICATE_CART_PRODUCT'); continue; }
    seen.add(id);
    const p = products.find(p=>p.id===id);
    if (!p || p.available === false || p.ecommerceEnabled === false) {
      blockers.push(`PRODUCT_NOT_SELLABLE:${id}`); continue;
    }
    if (p.wholesaleMinQuantity && p.wholesalePrice && qty >= p.wholesaleMinQuantity) {
      blockers.push(`WHOLESALE_PRICE_REQUIRES_REVIEW:${id}`); continue;
    }
    const variants = p.variants || [];
    const requested = requestedVariants[id] ?? (typeof entry.variantId === 'string' ? entry.variantId : '');
    if (variants.length && (!requested || !variants.some(v=>v.id===requested))) {
      blockers.push(`VARIANT_MAPPING_REQUIRED:${id}`); continue;
    }
    if (!variants.length && requested) { blockers.push(`UNKNOWN_VARIANT:${id}`); continue; }
    const variant = variants.find(v=>v.id===requested);
    const unit = toMinor(Number(variant?.price ?? p.price));
    if (unit === null || unit <= 0 || qty * unit !== subtotalMinor) {
      blockers.push(`AUTHORITATIVE_PRICE_MISMATCH:${id}`); continue;
    }
    const matched = balances.filter(b=>b.product_id===id && b.variant_id===requested && b.location_id===storeId);
    if (matched.length !== 1 || !Number.isSafeInteger(Number(matched[0]?.on_hand)) ||
        Number(matched[0].on_hand) < qty) { blockers.push(`STOCK_NOT_CONFIRMED:${id}`); continue; }
    sum += subtotalMinor;
    lines.push({productId:id,variantId:requested,quantity:qty,unitPriceMinor:unit});
  }
  if (sum !== kes * 100) blockers.push('PAID_TOTAL_MISMATCH');
  return blockers.length ? {ok:false,blockers:[...new Set(blockers)]} : {ok:true,amountMinor:sum,lines};
}
