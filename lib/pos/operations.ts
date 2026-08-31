import "server-only";

import { createHash } from "node:crypto";

import type { PosSeller } from "@/lib/pos/server";
import { addInventoryMovementsToTransaction, recordAuditEvent } from "@/lib/pos/ledger";
import { serverClient } from "@/sanity/lib/serverClient";

const PAYSTACK_API = "https://api.paystack.co";

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-");
}

function hashId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  return key;
}

async function paystackRefund(reference: string, amount: number) {
  const response = await fetch(`${PAYSTACK_API}/refund`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${getSecretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: reference, amount: Math.round(amount * 100), currency: "KES" }),
  });
  const payload = (await response.json()) as { status?: boolean; message?: string; data?: { id?: number; status?: string; transaction?: { reference?: string } } };
  if (!response.ok || !payload.status) throw new Error(payload.message || "Paystack refund could not be started.");
  return payload.data;
}

export type PosHistoryOrder = {
  id: string;
  orderNumber: string;
  receiptNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  salesChannel: "ONLINE" | "POS";
  soldByName: string;
  soldAt: string;
  paymentStatus: string;
  paymentChannel: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  cashTendered: number;
  cashChangeDue: number;
  refundedAmount: number;
  paymentReference: string;
  paymentProvider: string;
  providerReceiptNumber: string;
  lineItems: Array<{ productId: string; name: string; variantId?: string; quantity: number; unitPrice: number }>;
};

const historyProjection = `{
  "id": _id,
  orderNumber,
  "receiptNumber": coalesce(receiptNumber, "RCT-" + orderNumber),
  "customerId": customer._ref,
  "customerName": coalesce(customerName,"Customer"),
  "customerPhone": coalesce(customerPhone,""),
  "customerEmail": coalesce(customerEmail,""),
  "salesChannel": coalesce(salesChannel,"ONLINE"),
  "soldByName": coalesce(soldByName,"Online"),
  "soldAt": coalesce(soldAt,paidAt,createdAt),
  "paymentStatus": coalesce(paymentStatus,"pending"),
  "paymentChannel": coalesce(paymentChannel,""),
  "subtotal": coalesce(subtotal,total,0),
  "discountAmount": coalesce(discountAmount,0),
  "total": coalesce(total,0),
  "amountPaid": coalesce(amountPaid, select(paymentStatus == "paid" => total, 0)),
  "balanceDue": coalesce(balanceDue, select(paymentStatus == "paid" => 0, total)),
  "cashTendered": coalesce(cashTendered,0),
  "cashChangeDue": coalesce(cashChangeDue,0),
  "refundedAmount": coalesce(refundedAmount,0),
  "paymentReference": coalesce(paymentReference,""),
  "paymentProvider": coalesce(paymentProvider,""),
  "providerReceiptNumber": coalesce(providerReceiptNumber,paystackTransactionId,""),
  "lineItems": lineItems[]{"productId":coalesce(product._ref,productId),name,variantId,quantity,unitPrice}
}`;

export async function listSalesHistory({ limit = 100, channel }: { limit?: number; channel?: "ONLINE" | "POS" } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  return serverClient.fetch<PosHistoryOrder[]>(
    `*[_type == "commerceOrder" && (!defined($channel) || salesChannel == $channel)] | order(coalesce(soldAt,paidAt,createdAt) desc)[0...$limit]${historyProjection}`,
    { limit: safeLimit, channel: channel || null },
    { cache: "no-store" },
  );
}

export async function listReceivables() {
  return serverClient.fetch<PosHistoryOrder[]>(
    `*[_type == "commerceOrder" && coalesce(balanceDue,0) > 0 && paymentStatus in ["partially_paid","pending"]] | order(coalesce(soldAt,createdAt) desc)[0...250]${historyProjection}`,
    {},
    { cache: "no-store" },
  );
}

export type SalesReport = {
  period: "day" | "week" | "month";
  start: string;
  end: string;
  totalSales: number;
  onlineSales: number;
  posSales: number;
  cashPayments: number;
  mpesaPayments: number;
  paystackPayments: number;
  outstandingReceivables: number;
  refunds: number;
  failedPayments: number;
  pendingPayments: number;
  orders: number;
  byDate: Array<{ date: string; orders: number; revenue: number }>;
  byProduct: Array<{ name: string; quantity: number; revenue: number }>;
  byCashier: Array<{ name: string; orders: number; revenue: number }>;
};

function reportWindow(period: "day" | "week" | "month", now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (period === "day") start.setHours(0, 0, 0, 0);
  if (period === "week") {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
  }
  if (period === "month") {
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getSalesReport(period: "day" | "week" | "month"): Promise<SalesReport> {
  const { start, end } = reportWindow(period);
  const [orders, refunds, failedPending, globalReceivables] = await Promise.all([
    serverClient.fetch<PosHistoryOrder[]>(
      `*[_type == "commerceOrder" && coalesce(soldAt,paidAt,createdAt) >= $start && coalesce(soldAt,paidAt,createdAt) <= $end && paymentStatus in ["paid","partially_paid","refunded"]]${historyProjection}`,
      { start, end }, { cache: "no-store" },
    ),
    serverClient.fetch<Array<{ amount?: number }>>(
      `*[_type == "returnTransaction" && createdAt >= $start && createdAt <= $end && status != "failed"]{"amount":coalesce(refundAmount,0)}`,
      { start, end }, { cache: "no-store" },
    ),
    serverClient.fetch<Array<{ status?: string }>>(
      `*[_type == "paymentTransaction" && createdAt >= $start && createdAt <= $end && status in ["failed","pending","timed_out"]]{status}`,
      { start, end }, { cache: "no-store" },
    ),
    serverClient.fetch<number>(`coalesce(math::sum(*[_type == "commerceOrder" && coalesce(balanceDue,0) > 0].balanceDue),0)`, {}, { cache: "no-store" }),
  ]);

  const paidValue = (order: PosHistoryOrder) => Math.max(0, order.amountPaid - order.refundedAmount);
  const dateMap = new Map<string, { date: string; orders: number; revenue: number }>();
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const cashierMap = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const order of orders) {
    const date = (order.soldAt || "").slice(0, 10) || "Unknown";
    const dateRow = dateMap.get(date) || { date, orders: 0, revenue: 0 };
    dateRow.orders += 1;
    dateRow.revenue += paidValue(order);
    dateMap.set(date, dateRow);
    for (const line of order.lineItems || []) {
      const current = productMap.get(line.productId || line.name) || { name: line.name || "Product", quantity: 0, revenue: 0 };
      current.quantity += Number(line.quantity || 0);
      current.revenue += Number(line.quantity || 0) * Number(line.unitPrice || 0);
      productMap.set(line.productId || line.name, current);
    }
    const cashier = order.salesChannel === "POS" ? order.soldByName || "POS Staff" : "Online Shop";
    const current = cashierMap.get(cashier) || { name: cashier, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += paidValue(order);
    cashierMap.set(cashier, current);
  }

  const channelAmount = (predicate: (order: PosHistoryOrder) => boolean) => orders.filter(predicate).reduce((sum, order) => sum + paidValue(order), 0);
  return {
    period,
    start,
    end,
    totalSales: orders.reduce((sum, order) => sum + paidValue(order), 0),
    onlineSales: channelAmount((order) => order.salesChannel === "ONLINE"),
    posSales: channelAmount((order) => order.salesChannel === "POS"),
    cashPayments: channelAmount((order) => order.paymentChannel === "cash"),
    mpesaPayments: channelAmount((order) => order.paymentChannel === "mobile_money"),
    paystackPayments: channelAmount((order) => order.paymentProvider === "paystack" && order.paymentChannel !== "mobile_money"),
    outstandingReceivables: Number(globalReceivables || 0),
    refunds: refunds.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    failedPayments: failedPending.filter((row) => row.status === "failed" || row.status === "timed_out").length,
    pendingPayments: failedPending.filter((row) => row.status === "pending").length,
    orders: orders.length,
    byDate: [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    byProduct: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    byCashier: [...cashierMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
  };
}

export type ExpenseInput = {
  expenseType: "EXPENSE" | "PETTY_CASH" | "STAFF_PAYMENT" | "SALARY";
  staffName?: string;
  description: string;
  amount: number;
  paymentMethod: "cash" | "mpesa" | "paystack" | "other";
  transactionReference?: string;
  expenseDate?: string;
};

export async function listExpenses(limit = 150) {
  return serverClient.fetch<Array<{
    id: string; expenseNumber: string; expenseType: string; staffName?: string; description: string; amount: number; paymentMethod?: string; transactionReference?: string; expenseDate: string; createdByName?: string;
  }>>(
    `*[_type == "expenseTransaction"] | order(expenseDate desc)[0...$limit]{"id":_id,expenseNumber,expenseType,staffName,description,amount,paymentMethod,transactionReference,expenseDate,createdByName}`,
    { limit: Math.max(1, Math.min(500, limit)) }, { cache: "no-store" },
  );
}

export async function createExpense(input: ExpenseInput, seller: PosSeller) {
  if (seller.role !== "ADMIN" && seller.role !== "STORE") throw new Error("Only Admin or Store Manager can record expenditure.");
  const description = cleanText(input.description);
  const amount = Number(input.amount);
  if (!description) throw new Error("Expense description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid expense amount.");
  if (!input.expenseType || !["EXPENSE", "PETTY_CASH", "STAFF_PAYMENT", "SALARY"].includes(input.expenseType)) throw new Error("Select a valid expense type.");
  const now = new Date().toISOString();
  const expenseDate = input.expenseDate && !Number.isNaN(Date.parse(input.expenseDate)) ? new Date(input.expenseDate).toISOString() : now;
  const key = `${seller.id}|${expenseDate}|${description}|${amount}`;
  const id = `expenseTransaction.${hashId(key)}`;
  const expenseNumber = `EXP-${hashId(key).slice(0, 12).toUpperCase()}`;
  await serverClient.createIfNotExists({
    _id: id, _type: "expenseTransaction", expenseNumber, expenseType: input.expenseType,
    staffName: cleanText(input.staffName) || undefined, description, amount, currency: "KES",
    paymentMethod: input.paymentMethod || "other", transactionReference: cleanText(input.transactionReference) || undefined,
    expenseDate, createdBy: { _type: "reference", _ref: seller.id }, createdByName: seller.name, createdByRole: seller.role, createdAt: now,
  });
  await recordAuditEvent({ key: `expense|${id}`, eventType: "EXPENSE_RECORDED", entityType: "expenseTransaction", entityId: id, entityLabel: expenseNumber, actor: seller, detail: `${input.expenseType} · KES ${amount.toLocaleString("en-KE")} · ${description}` });
  return { id, expenseNumber };
}

type RefundInput = {
  orderId: string;
  refundAmount: number;
  reason: string;
  restock: boolean;
  cancelOutstanding?: boolean;
  items?: Array<{ productId: string; variantId?: string; quantity: number }>;
};

type RefundOrder = PosHistoryOrder & { _rev: string };

function incrementVariantStock(variants: Array<Record<string, unknown>> | undefined, returned: Array<{ variantId?: string; quantity: number }>) {
  if (!variants?.length) return undefined;
  let changed = false;
  const next = variants.map((variant) => {
    const key = typeof variant._key === "string" ? variant._key : "";
    const current = typeof variant.stockQuantity === "number" ? variant.stockQuantity : null;
    if (!key || current === null) return variant;
    const qty = returned.filter((row) => row.variantId === key).reduce((sum, row) => sum + row.quantity, 0);
    if (!qty) return variant;
    changed = true;
    return { ...variant, stockQuantity: current + qty };
  });
  return changed ? next : undefined;
}

export async function processReturnRefund(input: RefundInput, seller: PosSeller) {
  if (seller.role !== "ADMIN" && seller.role !== "STORE") throw new Error("Only Admin or Store Manager can process refunds or returns.");
  const order = await serverClient.fetch<RefundOrder | null>(
    `*[_type == "commerceOrder" && _id == $id][0]{
      _rev,${historyProjection.slice(1, -1)}
    }`,
    { id: input.orderId }, { cache: "no-store" },
  );
  if (!order) throw new Error("Order not found.");
  const reason = cleanText(input.reason);
  if (!reason) throw new Error("Refund / return reason is required.");
  const alreadyRefunded = Number(order.refundedAmount || 0);
  const availableRefund = Math.max(0, Number(order.amountPaid || 0) - alreadyRefunded);
  const refundAmount = Number(input.refundAmount);
  if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > availableRefund) throw new Error(`Refund amount must be between KES 0 and KES ${availableRefund.toLocaleString("en-KE")}.`);

  const requestedItems = Array.isArray(input.items) && input.items.length > 0
    ? input.items.map((row) => ({ productId: cleanText(row.productId), variantId: cleanText(row.variantId) || undefined, quantity: Math.max(0, Math.floor(Number(row.quantity || 0))) })).filter((row) => row.productId && row.quantity > 0)
    : refundAmount >= availableRefund && input.restock
      ? order.lineItems.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity }))
      : [];

  for (const returned of requestedItems) {
    const sold = order.lineItems.filter((line) => line.productId === returned.productId && (!returned.variantId || line.variantId === returned.variantId)).reduce((sum, line) => sum + line.quantity, 0);
    const priorReturned = await serverClient.fetch<number>(
      `coalesce(math::sum(*[_type == "returnTransaction" && order._ref == $orderId].items[productId == $productId && (!defined($variantId) || variantId == $variantId)].quantity),0)`,
      { orderId: order.id, productId: returned.productId, variantId: returned.variantId || null },
    );
    if (returned.quantity + Number(priorReturned || 0) > sold) throw new Error("Return quantity exceeds the quantity originally sold.");
  }

  let providerRefundId = "";
  let providerStatus = "completed";
  if (refundAmount > 0 && order.paymentProvider === "paystack") {
    const refund = await paystackRefund(order.paymentReference, refundAmount);
    providerRefundId = refund?.id ? String(refund.id) : "";
    providerStatus = refund?.status && !["processed", "success"].includes(refund.status) ? "pending_provider" : "completed";
  }

  const productIds = [...new Set(requestedItems.map((row) => row.productId))];
  const products = productIds.length ? await serverClient.fetch<Array<{ _id: string; _rev: string; name?: string; initialStock?: number; variants?: Array<Record<string, unknown>> }>>(
    `*[_type == "product" && _id in $ids]{_id,_rev,name,initialStock,variants}`, { ids: productIds }, { cache: "no-store" },
  ) : [];

  const now = new Date().toISOString();
  const key = `${order.orderNumber}|${now}|${refundAmount}|${reason}`;
  const returnId = `returnTransaction.${hashId(key)}`;
  const returnNumber = `RET-${hashId(key).slice(0, 12).toUpperCase()}`;
  const transaction = serverClient.transaction();
  const movements: Array<{ productId: string; productName: string; variantId?: string; quantityChange: number; stockBefore?: number; stockAfter?: number }> = [];

  if (input.restock) {
    for (const product of products) {
      const rows = requestedItems.filter((row) => row.productId === product._id);
      const qty = rows.reduce((sum, row) => sum + row.quantity, 0);
      if (!qty) continue;
      if (typeof product.initialStock === "number") {
        const nextStock = product.initialStock + qty;
        const nextVariants = incrementVariantStock(product.variants, rows);
        transaction.patch(product._id, (patch) => patch.ifRevisionId(product._rev).set({ initialStock: nextStock, available: true, ...(nextVariants ? { variants: nextVariants } : {}) }));
        rows.forEach((row) => movements.push({ productId: product._id, productName: product.name || "Product", variantId: row.variantId, quantityChange: row.quantity, stockBefore: product.initialStock, stockAfter: nextStock }));
      }
    }
  }

  const nextRefunded = alreadyRefunded + refundAmount;
  const nextBalance = input.cancelOutstanding ? 0 : Number(order.balanceDue || 0);
  const fullyRefunded = nextRefunded >= Number(order.amountPaid || 0) && nextBalance <= 0;
  const totalSoldQuantity = order.lineItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const returnedQuantity = requestedItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  transaction.patch(order.id, (patch) => patch.ifRevisionId(order._rev).set({
    refundedAmount: nextRefunded,
    balanceDue: nextBalance,
    paymentStatus: fullyRefunded ? "refunded" : order.paymentStatus,
    returnStatus: returnedQuantity > 0 && returnedQuantity >= totalSoldQuantity ? "returned" : "partial",
    lastRefundAt: now,
    updatedAt: now,
  }));
  transaction.create({
    _id: returnId, _type: "returnTransaction", returnNumber,
    order: { _type: "reference", _ref: order.id }, orderNumber: order.orderNumber, reason, refundAmount,
    restock: Boolean(input.restock), status: providerStatus, providerRefundId: providerRefundId || undefined,
    items: requestedItems.map((row, index) => {
      const soldLine = order.lineItems.find((line) => line.productId === row.productId && (!row.variantId || line.variantId === row.variantId));
      return { _key: `${index}-${safeId(row.productId)}`, _type: "object", product: { _type: "reference", _ref: row.productId }, productId: row.productId, name: soldLine?.name || "Product", variantId: row.variantId, quantity: row.quantity, unitPrice: Number(soldLine?.unitPrice || 0) };
    }),
    processedBy: { _type: "reference", _ref: seller.id }, processedByName: seller.name, processedByRole: seller.role, createdAt: now,
  });
  addInventoryMovementsToTransaction({ transaction, movementKey: `return|${returnId}`, movementType: "RETURN", orderId: order.id, orderNumber: order.orderNumber, actor: seller, movements, note: reason, createdAt: now });
  transaction.createIfNotExists({
    _id: `auditEvent.${hashId(`return|${returnId}`)}`, _type: "auditEvent", eventNumber: `AUD-${hashId(`return|${returnId}`).slice(0, 12).toUpperCase()}`,
    eventType: "RETURN_REFUND_PROCESSED", entityType: "commerceOrder", entityId: order.id, entityLabel: order.orderNumber,
    actor: { _type: "reference", _ref: seller.id }, actorName: seller.name, actorRole: seller.role,
    detail: `${returnNumber} · refund KES ${refundAmount.toLocaleString("en-KE")} · ${input.restock ? "restocked" : "not restocked"} · ${reason}`, createdAt: now,
  });
  if (refundAmount > 0) {
    const paymentRef = `${order.orderNumber}-REF-${hashId(key).slice(0, 8)}`;
    transaction.createIfNotExists({
      _id: `paymentTransaction.${safeId(paymentRef)}`, _type: "paymentTransaction", reference: paymentRef,
      order: { _type: "reference", _ref: order.id }, orderNumber: order.orderNumber,
      ...(order.customerId ? { customer: { _type: "reference", _ref: order.customerId } } : {}),
      customerName: order.customerName, customerPhone: order.customerPhone, salesChannel: order.salesChannel,
      provider: order.paymentProvider || "cash", channel: order.paymentChannel || "cash", status: "refunded", amount: refundAmount, currency: "KES",
      providerTransactionId: providerRefundId || undefined, processedBy: { _type: "reference", _ref: seller.id }, processedByName: seller.name, processedByRole: seller.role,
      createdAt: now, updatedAt: now, refundedAt: now,
    });
  }
  await transaction.commit();

  if (order.customerId && input.cancelOutstanding && Number(order.balanceDue || 0) > 0) {
    const currentBalance = await serverClient.fetch<number>(`coalesce(*[_id == $id][0].outstandingBalance,0)`, { id: order.customerId });
    await serverClient.patch(order.customerId).set({ outstandingBalance: Math.max(0, Number(currentBalance || 0) - Number(order.balanceDue || 0)), updatedAt: now }).commit();
  }
  return { returnId, returnNumber, providerStatus, refundAmount, restockedItems: requestedItems.length };
}

export async function getAuditTrail(limit = 100) {
  return serverClient.fetch<Array<{ id: string; eventNumber: string; eventType: string; entityLabel?: string; actorName?: string; actorRole?: string; detail?: string; createdAt: string }>>(
    `*[_type == "auditEvent"] | order(createdAt desc)[0...$limit]{"id":_id,eventNumber,eventType,entityLabel,actorName,actorRole,detail,createdAt}`,
    { limit: Math.max(1, Math.min(500, limit)) }, { cache: "no-store" },
  );
}

export async function getPaymentReconciliation(limit = 200) {
  return serverClient.fetch<Array<{ id: string; reference: string; orderNumber?: string; provider?: string; channel?: string; status: string; amount: number; providerTransactionId?: string; providerReceiptNumber?: string; processedByName?: string; createdAt: string; paidAt?: string }>>(
    `*[_type == "paymentTransaction"] | order(createdAt desc)[0...$limit]{"id":_id,reference,orderNumber,provider,channel,status,amount,providerTransactionId,providerReceiptNumber,processedByName,createdAt,paidAt}`,
    { limit: Math.max(1, Math.min(500, limit)) }, { cache: "no-store" },
  );
}
