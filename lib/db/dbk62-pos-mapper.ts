/** Pure conversion for verified, persisted DBK-62 real manual sales. No test data. */
export type RealNeonOrder = {
  order_id: string;
  order_number: string;
  store_id: string;
  seller_id: string;
  subtotal_minor: number | string;
  discount_minor: number | string;
  delivery_minor: number | string;
  total_minor: number | string;
  collected_minor: number | string;
  balance_due_minor: number | string;
  overpaid_minor: number | string;
  financial_status: string;
  created_at: string | Date;
  display_snapshot: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    sellerName: string;
    sellerRole: string;
    storeName: string;
    paymentName: string;
    paymentReference: string;
    internalReference: string;
    discountType: string;
    discountValue: number;
    discountReason: string;
    discountAuthorizedByName: string;
    receiptNumber: string;
    deliveryLocation: string;
    productNames: string[];
    lineDetails: Array<{ category?: string; finish?: string; size?: string; unitCost?: number }>;
  };
  lines: Array<{product_id:string;variant_id:string;quantity:number;unit_price_minor:string|number}>;
  payments: Array<{provider:string;provider_reference:string;payment_purpose:string;amount_minor:string|number}>;
};
export function isDbk62RealOrderId(id: string): boolean {
  return /^dbk62\.order\.[0-9a-f]{24}$/.test(id);
}
function kes(raw: string | number): number {
  const value = String(raw);
  if (!/^(0|[1-9][0-9]*)$/.test(value) || Number(value)>1_000_000_000_000) {
    throw new Error('Invalid Neon money amount');
  }
  return Number(value)/100;
}
export function mapDBK62History(row: RealNeonOrder) {
  if (!isDbk62RealOrderId(row.order_id) || !/^DBK62-POS-[0-9a-f]{24}$/.test(row.order_number)) {
    throw new Error('DBK-62 refuses non-real or synthetic orders');
  }
  const display = row.display_snapshot;
  if (!display || !/^DBK-POS-[A-Za-z0-9-]{8,80}$/.test(display.internalReference) ||
      !Array.isArray(display.productNames) || !Array.isArray(row.lines) ||
      display.productNames.length !== row.lines.length) {
    throw new Error('DBK-62 missing immutable receipt snapshot');
  }
  const status = row.financial_status === 'PAID' ? 'paid'
    : row.financial_status === 'PARTIALLY_PAID' ? 'partially_paid'
    : row.financial_status === 'UNPAID' ? 'pending' : (() => {throw new Error('Unknown Neon payment status')})();
  const soldAt = new Date(row.created_at).toISOString();
  const initial = row.payments.find(p=>p.payment_purpose==='INITIAL');
  if (!initial || initial.provider !== 'manual' || initial.provider_reference !== display.paymentReference) {
    throw new Error('DBK-62 initial payment has no matching ledger evidence');
  }
  return {
    id:row.order_id,orderNumber:row.order_number,
    receiptNumber:display.receiptNumber,
    customerName:display.customerName,customerPhone:display.customerPhone,customerEmail:display.customerEmail,
    salesChannel:'POS' as const,soldByName:display.sellerName,soldAt,
    paymentStatus:status,paymentChannel:'external',
    subtotal:kes(row.subtotal_minor),discountAmount:kes(row.discount_minor),total:kes(row.total_minor),
    amountPaid:kes(row.collected_minor),balanceDue:kes(row.balance_due_minor),
    cashTendered:kes(row.collected_minor),cashChangeDue:kes(row.overpaid_minor),
    deliveryFee:kes(row.delivery_minor),deliveryLocation:display.deliveryLocation,
    refundedAmount:0,paymentReference:display.internalReference,paymentProvider:'manual',
    providerReceiptNumber:display.paymentReference,storeLocationId:row.store_id,storeLocationName:display.storeName,
    lineItems:row.lines.map((line,i)=>({
      productId:line.product_id,name:display.productNames[i],variantId:line.variant_id||undefined,
      quantity:Number(line.quantity),unitPrice:kes(line.unit_price_minor),
      unitCost:display.lineDetails?.[i]?.unitCost||0,
    })),
  };
}
export function mapDBK62Receipt(row: RealNeonOrder) {
  const h=mapDBK62History(row);
  const d=row.display_snapshot;
  return {
    ...h,_id:h.id,discountType:d.discountType||undefined,discountValue:d.discountValue,
    discountReason:d.discountReason,discountAuthorizedByName:d.discountAuthorizedByName,
    deliveryAddress:undefined,fulfilmentType:'IN_STORE' as const,overpaidAmount:kes(row.overpaid_minor),
    manualPaymentName:d.paymentName,manualPaymentReference:d.paymentReference,
    soldByRole:d.sellerRole,businessName:'Decor by Kasiwa',businessEmail:'',businessPhone:'',
    businessWebsite:'decorbykasiwa.co.ke',
  };
}
export function filterDBK62History<T extends ReturnType<typeof mapDBK62History>>(
  orders:T[], opts:{storeId?:string;query?:string;cashier?:string;channel?:'POS'|'ONLINE';from?:string;to?:string;limit?:number}={}
) {
  if (opts.channel==='ONLINE') return [];
  const q=opts.query?.trim().toLowerCase();
  let from=Number.NEGATIVE_INFINITY,to=Number.POSITIVE_INFINITY;
  if (opts.from || opts.to) {
    if (!opts.from || !opts.to || !/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
      throw new Error('Supply a valid start and end date');
    }
    from=Date.parse(`${opts.from}T00:00:00+03:00`);
    to=Date.parse(`${opts.to}T23:59:59.999+03:00`);
    if (!Number.isFinite(from)||!Number.isFinite(to)||from>to) throw new Error('Invalid sales date interval');
  }
  return orders.filter(o=>(!opts.storeId||o.storeLocationId===opts.storeId)
    && (!opts.cashier||o.soldByName===opts.cashier)
    && (!q||[o.orderNumber,o.receiptNumber,o.paymentReference,o.customerName,o.customerPhone,
      ...o.lineItems.map(l=>l.name)].some(v=>v.toLowerCase().includes(q)))
    && Date.parse(o.soldAt)>=from && Date.parse(o.soldAt)<=to)
    .sort((a,b)=>b.soldAt.localeCompare(a.soldAt))
    .slice(0,Math.max(1,Math.min(500,Math.floor(opts.limit||150))));
}
