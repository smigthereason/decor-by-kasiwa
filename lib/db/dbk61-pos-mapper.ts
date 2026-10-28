/** DBK-61: test-only legacy-compatible presentation of synthetic Neon sales.
 * Pure conversion; never writes, accepts provider proof, or changes stock.
 */
export type NeonTestOrder = {
  order_id: string;
  order_number: string;
  store_id: string;
  seller_id: string;
  subtotal_minor: string | number;
  discount_minor: string | number;
  delivery_minor: string | number;
  total_minor: string | number;
  collected_minor: string | number;
  balance_due_minor: string | number;
  overpaid_minor: string | number;
  financial_status: string;
  created_at: string | Date;
  display_snapshot?: { storeName?: string; sellerName?: string; productNames?: string[] };
  lines: Array<{ product_id: string; variant_id: string; quantity: number; unit_price_minor: string | number }>;
  payments: Array<{ provider: string; provider_reference: string; payment_purpose: string; amount_minor: string | number }>;
  stageOnly?: boolean;
  simulatedPayment?: boolean;
};

function kes(value: string | number): number {
  const raw = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || Number(raw) > 1_000_000_000_000) {
    throw new Error("Invalid Neon minor-unit monetary amount");
  }
  return Number(raw) / 100;
}
function at(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid Neon sale timestamp");
  return date.toISOString();
}
export function isDbk61SyntheticOrderId(id: string) {
  return /^dbk58[.]order[.][0-9a-f]{24}$/.test(id);
}
export function mapDbk61HistoryOrder(order: NeonTestOrder) {
  if (!isDbk61SyntheticOrderId(order.order_id) || order.stageOnly !== true || order.simulatedPayment !== true) {
    throw new Error("DBK-61 cannot represent non-synthetic or unverified order");
  }
  const display = order.display_snapshot || {};
  const pay = order.payments?.find(p => p.payment_purpose === "INITIAL");
  const status = order.financial_status === "PAID" ? "paid"
    : order.financial_status === "PARTIALLY_PAID" ? "partially_paid" : "pending";
  const lineItems = (order.lines || []).map((line, index) => ({
    productId: line.product_id,
    name: display.productNames?.[index] || `TEST ITEM ${index + 1}`,
    variantId: line.variant_id || undefined,
    quantity: Number(line.quantity),
    unitPrice: kes(line.unit_price_minor),
    unitCost: 0,
  }));
  return {
    id: order.order_id,
    orderNumber: order.order_number,
    receiptNumber: `TEST-${order.order_number}`,
    customerName: "SYNTHETIC TEST CUSTOMER",
    customerPhone: "",
    customerEmail: "",
    salesChannel: "POS" as const,
    soldByName: display.sellerName || "TEST ADMIN",
    soldAt: at(order.created_at),
    paymentStatus: status,
    paymentChannel: "manual",
    subtotal: kes(order.subtotal_minor),
    discountAmount: kes(order.discount_minor),
    total: kes(order.total_minor),
    amountPaid: kes(order.collected_minor),
    balanceDue: kes(order.balance_due_minor),
    cashTendered: kes(order.collected_minor),
    cashChangeDue: kes(order.overpaid_minor),
    deliveryFee: kes(order.delivery_minor),
    deliveryLocation: "TEST ONLY",
    refundedAmount: 0,
    paymentReference: pay?.provider_reference || "",
    paymentProvider: "manual",
    providerReceiptNumber: "",
    storeLocationId: order.store_id,
    storeLocationName: display.storeName || "TEST STORE",
    lineItems,
    testOnly: true,
    simulatedPayment: true,
  };
}
export function dbk61TestReceipt(order: NeonTestOrder) {
  const history = mapDbk61HistoryOrder(order);
  return {
    _id: history.id,
    ...history,
    discountType: undefined,
    deliveryAddress: undefined,
    fulfilmentType: "IN_STORE" as const,
    overpaidAmount: kes(order.overpaid_minor),
    manualPaymentName: "SYNTHETIC PAYER",
    manualPaymentReference: history.paymentReference,
    soldByRole: "ADMIN",
    businessName: "TEST ONLY — Decor by Kasiwa",
    businessEmail: "",
    businessPhone: "",
    businessWebsite: "TEST ONLY — NOT A REAL RECEIPT",
  };
}

export type Dbk61HistoryFilter = {
  storeId?: string;
  query?: string;
  cashier?: string;
  channel?: "POS" | "ONLINE";
  from?: string;
  to?: string;
  limit?: number;
};
export function filterDbk61History<T extends ReturnType<typeof mapDbk61HistoryOrder>>(
  orders: T[], filters: Dbk61HistoryFilter = {}
): T[] {
  if (filters.channel === "ONLINE") return [];
  const term = filters.query?.trim().toLowerCase();
  let start: number | undefined;
  let end: number | undefined;
  if (filters.from || filters.to) {
    if (!filters.from || !filters.to || !/^\d{4}-\d{2}-\d{2}$/.test(filters.from) || !/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
      throw new Error("Select valid From and To dates for test history");
    }
    start = Date.parse(`${filters.from}T00:00:00+03:00`);
    end = Date.parse(`${filters.to}T23:59:59.999+03:00`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Invalid test history date range");
  }
  return orders.filter(o => (!filters.storeId || o.storeLocationId === filters.storeId)
    && (!filters.cashier || o.soldByName === filters.cashier)
    && (!term || [o.orderNumber,o.receiptNumber,o.paymentReference,...o.lineItems.map(l=>l.name)]
        .some(v => v.toLowerCase().includes(term)))
    && (start === undefined || Date.parse(o.soldAt) >= start)
    && (end === undefined || Date.parse(o.soldAt) <= end))
    .sort((a,b)=>b.soldAt.localeCompare(a.soldAt))
    .slice(0,Math.max(1,Math.min(25,Math.floor(filters.limit || 25))));
}
