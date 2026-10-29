/** Pure validation/mapping helpers shared by the DBK-68 POS integration. */
export type DBK68Snapshot = {
  reference:string; orderId:string; orderNumber:string; storeId:string; sellerId:string;
  sellerName:string; customerName:string; customerPhone:string;
  totalMinor:number; subtotalMinor:number; discountMinor:number;
  lines:Array<{productId:string;variantId:string;quantity:number;unitPriceMinor:number;name:string}>;
};
export type DBK68Order = {
  reference:string; order_id:string; order_number:string; store_id:string;
  amount_minor:string|number; phone:string; snapshot:DBK68Snapshot;
  payment_status:string; stock_status:string; checkout_id:string|null;
  merchant_id:string|null; receipt_number:string|null;
  result_description:string|null; callback_json:unknown; created_at:string|Date;
};
export function dbk68ValidReference(ref:string) {
  return /^DBK-POS-[A-Za-z0-9-]{8,80}$/.test(ref);
}
export function dbk68IsOrderId(id:string) {
  return /^dbk68\.order\.[a-f0-9]{24}$/.test(id);
}
export function dbk68Kes(value:string|number) {
  const n = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(n) || Number(n)>1_000_000_000_000) {
    throw new Error('Invalid financial minor units');
  }
  return Number(n)/100;
}
export function dbk68Summary(o:DBK68Order) {
  if (!dbk68ValidReference(o.reference) || !dbk68IsOrderId(o.order_id)) {
    throw new Error('Invalid Neon M-PESA order');
  }
  const s=o.snapshot;
  if (s.orderId!==o.order_id || s.reference!==o.reference ||
      s.totalMinor!==Number(o.amount_minor) || !Array.isArray(s.lines)) {
    throw new Error('DBK-68 immutable snapshot mismatch');
  }
  const paid=o.payment_status==='PAID';
  return {
    reference:o.reference,orderId:o.order_id,orderNumber:o.order_number,
    receiptNumber:`RCT-${o.order_number}`,paymentStatus:paid?'paid':o.payment_status==='FAILED'?'failed':'pending',
    status:paid?'completed':'pending',paymentProvider:'daraja',paymentChannel:'mobile_money',
    total:dbk68Kes(o.amount_minor),amountPaid:paid?dbk68Kes(o.amount_minor):0,
    balanceDue:paid?0:dbk68Kes(o.amount_minor),storeLocationId:o.store_id,
    customerName:s.customerName,customerPhone:`+${s.customerPhone}`,soldByName:s.sellerName,
    soldAt:new Date(o.created_at).toISOString(),providerReceiptNumber:o.receipt_number||undefined,
    inventoryReviewRequired:paid&&o.stock_status!=='COMMITTED',
    lineItems:s.lines.map(l=>({productId:l.productId,name:l.name,variantId:l.variantId||undefined,
      quantity:l.quantity,unitPrice:dbk68Kes(l.unitPriceMinor),unitCost:0})),
  };
}

/** Check callback fields *and* independently queried provider status before settlement. */
export function dbk68PaymentProofMatches(input:{
  callbackCheckout:string; expectedCheckout:string;
  callbackMerchant:string; expectedMerchant:string;
  callbackPhone:string|undefined; expectedPhone:string;
  callbackAmount:number|undefined; expectedAmountMinor:number;
  callbackReceipt:string|undefined;
  callbackResult:number; queryResult:number;
  queryCheckout:string; queryMerchant?:string;
  transactionDate?:string;
}) {
  return input.callbackResult===0 && input.queryResult===0 &&
    input.callbackCheckout===input.expectedCheckout &&
    input.queryCheckout===input.expectedCheckout &&
    input.callbackMerchant===input.expectedMerchant &&
    (!input.queryMerchant || input.queryMerchant===input.expectedMerchant) &&
    input.callbackPhone===input.expectedPhone &&
    typeof input.callbackAmount==='number' && Number.isFinite(input.callbackAmount) &&
    Number.isSafeInteger(Math.round(input.callbackAmount*100)) &&
    Math.round(input.callbackAmount*100)===input.expectedAmountMinor &&
    typeof input.callbackReceipt==='string' &&
    /^[A-Za-z0-9-]{6,30}$/.test(input.callbackReceipt) &&
    typeof input.transactionDate==='string' && /^\d{14}$/.test(input.transactionDate);
}
