import "server-only";

import { createHash } from "node:crypto";

import type { PosSeller } from "@/lib/pos/server";
import { addInventoryMovementsToTransaction, recordAuditEvent } from "@/lib/pos/ledger";
import { hasVariants, variantStockTotal } from "@/lib/inventory/stock";
import { adjustLocationBalance, type LocationBalance } from "@/lib/inventory/location-stock";
import { serverClient } from "@/sanity/lib/serverClient";
import { getMainStore, isLegacyStoreName, storeOrderPredicate, relatedOrderPredicate } from "@/lib/stores/main-store";

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
  deliveryFee: number;
  deliveryLocation: string;
  refundedAmount: number;
  paymentReference: string;
  paymentProvider: string;
  providerReceiptNumber: string;
  storeLocationId?: string;
  storeLocationName?: string;
  lineItems: Array<{ productId: string; name: string; variantId?: string; quantity: number; unitPrice: number; unitCost?: number }>;
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
  "deliveryFee": coalesce(deliveryFee,0),
  "deliveryLocation": coalesce(deliveryLocation,""),
  "refundedAmount": coalesce(refundedAmount,0),
  "paymentReference": coalesce(paymentReference,""),
  "paymentProvider": coalesce(paymentProvider,""),
  "providerReceiptNumber": coalesce(providerReceiptNumber,paystackTransactionId,""),
  "storeLocationId": storeLocation._ref,
  "storeLocationName": coalesce(storeLocation->name,assignedStore,""),
  "lineItems": lineItems[]{"productId":coalesce(product._ref,productId),name,variantId,quantity,unitPrice,unitCost}
}`;

export type SalesHistoryFilters = {
  limit?: number;
  channel?: "ONLINE" | "POS";
  cashier?: string;
  query?: string;
  from?: string;
  to?: string;
  storeId?: string;
};

function attributedHistoryOrders(orders: PosHistoryOrder[], main: Awaited<ReturnType<typeof getMainStore>>) {
  if (!main) return orders;
  return orders.map((order) => order.salesChannel === "ONLINE" && !order.storeLocationId && isLegacyStoreName(order.storeLocationName)
    ? { ...order, storeLocationId: main.id, storeLocationName: main.name }
    : order);
}

export async function listSalesHistory({ limit = 100, channel, cashier, query, from, to, storeId }: SalesHistoryFilters = {}) {
  const main = await getMainStore();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  let start: string | null = null;
  let end: string | null = null;
  if (from || to) {
    if (!from || !to) throw new Error("Select both From and To dates for sales history.");
    const startDate = kenyaDateBoundary(from);
    const endDate = kenyaDateBoundary(to, true);
    if (startDate > endDate) throw new Error("The sales history From date cannot be after the To date.");
    start = startDate.toISOString();
    end = endDate.toISOString();
  }
  const cashierName = cleanText(cashier) || null;
  const search = cleanText(query) || null;
  const searchPattern = search ? `*${search.replaceAll("*", "")}*` : null;
  const orders = await serverClient.fetch<PosHistoryOrder[]>(
    `*[_type == "commerceOrder"
      && (!defined($channel) || coalesce(salesChannel,"ONLINE") == $channel)
      && (!defined($cashier) || soldByName == $cashier)
      && ${storeOrderPredicate}
      && (!defined($searchPattern) || ([orderNumber,receiptNumber,customerName,customerPhone,customerEmail,providerReceiptNumber,paymentReference] match $searchPattern || lineItems[].name match $searchPattern))
      && (!defined($start) || coalesce(soldAt,paidAt,createdAt) >= $start)
      && (!defined($end) || coalesce(soldAt,paidAt,createdAt) <= $end)
    ] | order(coalesce(soldAt,paidAt,createdAt) desc)[0...$limit]${historyProjection}`,
    { limit: safeLimit, channel: channel || null, cashier: cashierName, storeId: cleanText(storeId) || null, mainStoreId: main?.id || null, searchPattern, start, end },
    { cache: "no-store" },
  );
  return attributedHistoryOrders(orders, main);
}

export async function listSalesCashiers(storeId?: string) {
  const names = await serverClient.fetch<string[]>(
    `array::unique(*[_type == "commerceOrder" && salesChannel == "POS" && defined(soldByName) && (!defined($storeId) || storeLocation._ref == $storeId)].soldByName)`,
    { storeId: cleanText(storeId) || null },
    { cache: "no-store" },
  );
  return (names || []).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export async function listReceivables(storeId?: string) {
  const main = await getMainStore();
  const orders = await serverClient.fetch<PosHistoryOrder[]>(
    `*[_type == "commerceOrder" && coalesce(balanceDue,0) > 0 && paymentStatus in ["partially_paid","pending"] && ${storeOrderPredicate}] | order(coalesce(soldAt,createdAt) desc)[0...250]${historyProjection}`,
    { storeId: cleanText(storeId) || null, mainStoreId: main?.id || null },
    { cache: "no-store" },
  );
  return attributedHistoryOrders(orders, main);
}

export type SalesReportPeriod = "day" | "week" | "month" | "custom";

export type SalesReport = {
  period: SalesReportPeriod;
  start: string;
  end: string;
  totalSales: number;
  moneyIn: number;
  deliveryPayables: number;
  onlineSales: number;
  posSales: number;
  manualPayments: number;
  mpesaPayments: number;
  paystackPayments: number;
  outstandingReceivables: number;
  refunds: number;
  failedPayments: number;
  pendingPayments: number;
  orders: number;
  byDate: Array<{ date: string; orders: number; revenue: number; deliveryPayables: number; moneyIn: number }>;
  byProduct: Array<{ name: string; quantity: number; revenue: number }>;
  byCashier: Array<{ name: string; orders: number; revenue: number }>;
  grossSales: number;
  discounts: number;
  returns: number;
  discountsAndReturns: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingProfit: number;
  expenseBreakdown: Array<{ ledgerAccount: string; label: string; amount: number }>;
  cogsFallbackLines: number;
  cogsUncostedLines: number;
};


export type LegacyExpenseCategory = "RENT" | "SALARIES" | "MARKETING" | "DELIVERY_UTILITIES" | "OTHER";

const LEGACY_LEDGER_LABELS: Record<LegacyExpenseCategory, string> = {
  RENT: "Rent",
  SALARIES: "Salaries",
  MARKETING: "Marketing",
  DELIVERY_UTILITIES: "Delivery & utilities",
  OTHER: "Other operating expenses",
};

function legacyLedgerAccount(value: unknown, expenseType?: string) {
  if (value === "RENT" || value === "SALARIES" || value === "MARKETING" || value === "DELIVERY_UTILITIES" || value === "OTHER") {
    return LEGACY_LEDGER_LABELS[value];
  }
  return expenseType === "SALARY" ? "Salaries" : "Other operating expenses";
}

function cleanLedgerAccount(value: unknown, legacyCategory?: unknown, expenseType?: string) {
  const provided = cleanText(value);
  return provided || legacyLedgerAccount(legacyCategory, expenseType);
}

type SalesReportRange = { from?: string; to?: string; storeId?: string };

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function kenyaDateBoundary(value: string, endOfDay = false) {
  if (!dateOnlyPattern.test(value)) throw new Error("Report dates must use YYYY-MM-DD format.");
  const timestamp = `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+03:00`;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) throw new Error("Select a valid report date.");
  return parsed;
}

function reportWindow(period: "day" | "week" | "month", range: SalesReportRange = {}, now = new Date()) {
  if (range.from || range.to) {
    if (!range.from || !range.to) throw new Error("Select both From and To dates for a custom report.");
    const start = kenyaDateBoundary(range.from);
    const end = kenyaDateBoundary(range.to, true);
    if (start > end) throw new Error("The report From date cannot be after the To date.");
    return { period: "custom" as const, start: start.toISOString(), end: end.toISOString() };
  }

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
  return { period, start: start.toISOString(), end: end.toISOString() };
}

export async function getSalesReport(period: "day" | "week" | "month", range: SalesReportRange = {}): Promise<SalesReport> {
  const { period: reportPeriod, start, end } = reportWindow(period, range);
  const storeId = cleanText(range.storeId) || null;
  const main = await getMainStore();
  const mainStoreId = main?.id || null;
  const [orders, returnRows, failedPending, globalReceivables, expenseRows] = await Promise.all([
    serverClient.fetch<PosHistoryOrder[]>(
      `*[_type == "commerceOrder" && coalesce(soldAt,paidAt,createdAt) >= $start && coalesce(soldAt,paidAt,createdAt) <= $end && paymentStatus in ["paid","partially_paid","refunded"] && ${storeOrderPredicate}]${historyProjection}`,
      { start, end, storeId, mainStoreId }, { cache: "no-store" },
    ),
    serverClient.fetch<Array<{ amount?: number; restock?: boolean; items?: Array<{ productId?: string; quantity?: number; unitCost?: number }> }>>(
      `*[_type == "returnTransaction" && createdAt >= $start && createdAt <= $end && status != "failed" && ${relatedOrderPredicate}]{
        "amount":coalesce(refundAmount,0),restock,
        "items":items[]{"productId":coalesce(product._ref,productId),quantity,unitCost}
      }`,
      { start, end, storeId, mainStoreId }, { cache: "no-store" },
    ),
    serverClient.fetch<Array<{ status?: string }>>(
      `*[_type == "paymentTransaction" && createdAt >= $start && createdAt <= $end && status in ["failed","pending","timed_out"] && ${relatedOrderPredicate}]{status}`,
      { start, end, storeId, mainStoreId }, { cache: "no-store" },
    ),
    serverClient.fetch<number>(`coalesce(math::sum(*[_type == "commerceOrder" && coalesce(balanceDue,0) > 0 && ${storeOrderPredicate}].balanceDue),0)`, { storeId, mainStoreId }, { cache: "no-store" }),
    serverClient.fetch<Array<{ ledgerAccount?: string; expenseCategory?: string; expenseType?: string; amount?: number }>>(
      `*[_type == "expenseTransaction" && expenseDate >= $start && expenseDate <= $end && (!defined($storeId) || storeLocation._ref == $storeId)]{ledgerAccount,expenseCategory,expenseType,amount}`,
      { start, end, storeId }, { cache: "no-store" },
    ),
  ]);

  const costProductIds = new Set<string>();
  for (const order of orders) {
    for (const line of order.lineItems || []) {
      if (line.productId && typeof line.unitCost !== "number") costProductIds.add(line.productId);
    }
  }
  for (const returned of returnRows) {
    if (!returned.restock) continue;
    for (const line of returned.items || []) {
      if (line.productId && typeof line.unitCost !== "number") costProductIds.add(line.productId);
    }
  }

  const currentCosts = costProductIds.size
    ? await serverClient.fetch<Array<{ id: string; unitCost?: number }>>(
        `*[_type == "product" && _id in $ids]{
          "id":_id,
          "unitCost":coalesce(*[_type == "inventoryRecord" && product._ref == ^._id][0].unitCost,procurementCost,0)
        }`,
        { ids: [...costProductIds] }, { cache: "no-store" },
      )
    : [];
  const currentCostByProduct = new Map(currentCosts.map((row) => [row.id, Math.max(0, Number(row.unitCost || 0))]));
  let cogsFallbackLines = 0;
  let cogsUncostedLines = 0;
  const lineCost = (productId: string | undefined, snapshot: number | undefined) => {
    if (typeof snapshot === "number" && Number.isFinite(snapshot)) {
      const cost = Math.max(0, snapshot);
      if (cost === 0) cogsUncostedLines += 1;
      return cost;
    }
    cogsFallbackLines += 1;
    const cost = productId ? currentCostByProduct.get(productId) || 0 : 0;
    if (cost === 0) cogsUncostedLines += 1;
    return cost;
  };

  const moneyInValue = (order: PosHistoryOrder) => Math.max(0, order.amountPaid - order.refundedAmount);
  const deliveryValue = (order: PosHistoryOrder) => Math.min(Math.max(0, order.deliveryFee), moneyInValue(order));
  const revenueValue = (order: PosHistoryOrder) => Math.max(0, moneyInValue(order) - deliveryValue(order));
  const dateMap = new Map<string, { date: string; orders: number; revenue: number; deliveryPayables: number; moneyIn: number }>();
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  const cashierMap = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const order of orders) {
    const date = (order.soldAt || "").slice(0, 10) || "Unknown";
    const dateRow = dateMap.get(date) || { date, orders: 0, revenue: 0, deliveryPayables: 0, moneyIn: 0 };
    dateRow.orders += 1;
    dateRow.revenue += revenueValue(order);
    dateRow.deliveryPayables += deliveryValue(order);
    dateRow.moneyIn += moneyInValue(order);
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
    current.revenue += revenueValue(order);
    cashierMap.set(cashier, current);
  }

  const grossSales = orders.reduce((sum, order) => sum + Math.max(0, Number(order.subtotal || 0)), 0);
  const discounts = orders.reduce((sum, order) => sum + Math.max(0, Number(order.discountAmount || 0)), 0);
  const returns = returnRows.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0);
  const discountsAndReturns = discounts + returns;
  const netSales = grossSales - discountsAndReturns;
  const soldCogs = orders.reduce((sum, order) => sum + (order.lineItems || []).reduce((lineSum, line) => {
    return lineSum + Math.max(0, Number(line.quantity || 0)) * lineCost(line.productId, line.unitCost);
  }, 0), 0);
  const returnedCogs = returnRows.reduce((sum, returned) => {
    if (!returned.restock) return sum;
    return sum + (returned.items || []).reduce((lineSum, line) => {
      return lineSum + Math.max(0, Number(line.quantity || 0)) * lineCost(line.productId, line.unitCost);
    }, 0);
  }, 0);
  const costOfGoodsSold = soldCogs - returnedCogs;
  const grossProfit = netSales - costOfGoodsSold;

  const expenseTotals = new Map<string, { label: string; amount: number }>();
  for (const expense of expenseRows) {
    const label = cleanLedgerAccount(expense.ledgerAccount, expense.expenseCategory, expense.expenseType);
    const key = label.toLocaleLowerCase("en-KE");
    const current = expenseTotals.get(key) || { label, amount: 0 };
    current.amount += Math.max(0, Number(expense.amount || 0));
    expenseTotals.set(key, current);
  }
  const expenseBreakdown = [...expenseTotals.values()]
    .filter((row) => row.amount > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "en-KE"))
    .map((row) => ({ ledgerAccount: row.label, label: row.label, amount: row.amount }));
  const operatingExpenses = expenseBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const operatingProfit = grossProfit - operatingExpenses;

  const channelRevenue = (predicate: (order: PosHistoryOrder) => boolean) => orders.filter(predicate).reduce((sum, order) => sum + revenueValue(order), 0);
  const channelMoneyIn = (predicate: (order: PosHistoryOrder) => boolean) => orders.filter(predicate).reduce((sum, order) => sum + moneyInValue(order), 0);
  return {
    period: reportPeriod,
    start,
    end,
    totalSales: orders.reduce((sum, order) => sum + revenueValue(order), 0),
    moneyIn: orders.reduce((sum, order) => sum + moneyInValue(order), 0),
    deliveryPayables: orders.reduce((sum, order) => sum + deliveryValue(order), 0),
    onlineSales: channelRevenue((order) => order.salesChannel === "ONLINE"),
    posSales: channelRevenue((order) => order.salesChannel === "POS"),
    manualPayments: channelMoneyIn((order) => order.paymentProvider === "manual" || order.paymentChannel === "external"),
    mpesaPayments: channelMoneyIn((order) => order.paymentChannel === "mobile_money"),
    paystackPayments: channelMoneyIn((order) => order.paymentProvider === "paystack" && order.paymentChannel !== "mobile_money"),
    outstandingReceivables: Number(globalReceivables || 0),
    refunds: returns,
    failedPayments: failedPending.filter((row) => row.status === "failed" || row.status === "timed_out").length,
    pendingPayments: failedPending.filter((row) => row.status === "pending").length,
    orders: orders.length,
    byDate: [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    byProduct: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    byCashier: [...cashierMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    grossSales,
    discounts,
    returns,
    discountsAndReturns,
    netSales,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    expenseBreakdown,
    cogsFallbackLines,
    cogsUncostedLines,
  };
}

export type ExpenseInput = {
  expenseType: "EXPENSE" | "PETTY_CASH" | "STAFF_PAYMENT" | "SALARY";
  storeLocationId?: string;
  ledgerAccount?: string;
  expenseCategory?: LegacyExpenseCategory;
  staffName?: string;
  description: string;
  amount: number;
  paymentMethod: "cash" | "mpesa" | "paystack" | "other";
  transactionReference?: string;
  expenseDate?: string;
};

export async function listExpenses(limit = 150, storeId?: string) {
  const rows = await serverClient.fetch<Array<{
    id: string; expenseNumber: string; expenseType: string; ledgerAccount?: string; expenseCategory?: LegacyExpenseCategory; staffName?: string; description: string; amount: number; paymentMethod?: string; transactionReference?: string; expenseDate: string; createdByName?: string; storeLocationId?: string; storeLocationName?: string; storeLocationCode?: string;
  }>>(
    `*[_type == "expenseTransaction" && (!defined($storeId) || storeLocation._ref == $storeId)] | order(expenseDate desc)[0...$limit]{"id":_id,expenseNumber,expenseType,ledgerAccount,expenseCategory,staffName,description,amount,paymentMethod,transactionReference,expenseDate,createdByName,"storeLocationId":storeLocation._ref,"storeLocationName":storeLocation->name,"storeLocationCode":storeLocation->code}`,
    { limit: Math.max(1, Math.min(500, limit)), storeId: cleanText(storeId) || null }, { cache: "no-store" },
  );
  return rows.map((row) => ({ ...row, ledgerAccount: cleanLedgerAccount(row.ledgerAccount, row.expenseCategory, row.expenseType) }));
}

export async function createExpense(input: ExpenseInput, seller: PosSeller) {
  if (!["ADMIN", "STORE", "MANAGER"].includes(seller.role)) throw new Error("Only Admin, Store Manager or Manager can record expenditure.");
  const description = cleanText(input.description);
  const amount = Number(input.amount);
  if (!description) throw new Error("Expense description is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid expense amount.");
  if (!input.expenseType || !["EXPENSE", "PETTY_CASH", "STAFF_PAYMENT", "SALARY"].includes(input.expenseType)) throw new Error("Select a valid expense type.");
  const ledgerAccount = cleanText(input.ledgerAccount) || (input.expenseType === "SALARY" ? "Salaries" : "");
  if (!ledgerAccount) throw new Error("Ledger account is required so this expenditure can be reported correctly in Profit & Loss.");
  const requestedStoreId = seller.role === "MANAGER" ? cleanText(seller.storeLocationId) : cleanText(input.storeLocationId);
  const storeLocation = requestedStoreId
    ? await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
        `*[_type == "storeLocation" && _id == $storeId && active != false][0]{_id,name,code}`,
        { storeId: requestedStoreId },
        { cache: "no-store" },
      )
    : null;
  if (seller.role === "MANAGER" && !storeLocation) throw new Error("Manager expenditure must be tied to the Manager's assigned store.");
  if (requestedStoreId && !storeLocation) throw new Error("Select an active store/location for this expenditure.");
  const now = new Date().toISOString();
  const expenseDate = input.expenseDate && !Number.isNaN(Date.parse(input.expenseDate)) ? new Date(input.expenseDate).toISOString() : now;
  const key = `${seller.id}|${expenseDate}|${description}|${amount}|${storeLocation?._id || "company"}`;
  const id = `expenseTransaction.${hashId(key)}`;
  const expenseNumber = `EXP-${hashId(key).slice(0, 12).toUpperCase()}`;
  await serverClient.createIfNotExists({
    _id: id, _type: "expenseTransaction", expenseNumber, expenseType: input.expenseType, ledgerAccount,
    staffName: cleanText(input.staffName) || undefined, description, amount, currency: "KES",
    paymentMethod: input.paymentMethod || "other", transactionReference: cleanText(input.transactionReference) || undefined,
    ...(storeLocation ? { storeLocation: { _type: "reference", _ref: storeLocation._id } } : {}),
    expenseDate, createdBy: { _type: "reference", _ref: seller.id }, createdByName: seller.name, createdByRole: seller.role, createdAt: now,
  });
  await recordAuditEvent({ key: `expense|${id}`, eventType: "EXPENSE_RECORDED", entityType: "expenseTransaction", entityId: id, entityLabel: expenseNumber, actor: seller, detail: `${storeLocation?.name || "Company-wide"} · ${ledgerAccount} · ${input.expenseType} · KES ${amount.toLocaleString("en-KE")} · ${description}` });
  return { id, expenseNumber };
}

type RefundInput = {
  orderId: string;
  refundAmount: number;
  reason: string;
  restock: boolean;
  cancelOutstanding?: boolean;
  manualRefundConfirmed?: boolean;
  manualRefundReference?: string;
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
  if (!["ADMIN", "STORE", "MANAGER"].includes(seller.role)) throw new Error("Only Admin, Store Manager or Manager can process refunds or returns.");
  const order = await serverClient.fetch<RefundOrder | null>(
    `*[_type == "commerceOrder" && _id == $id][0]{
      _rev,${historyProjection.slice(1, -1)}
    }`,
    { id: input.orderId }, { cache: "no-store" },
  );
  if (!order) throw new Error("Order not found.");
  const mainForReturn = order.salesChannel === "ONLINE" && !order.storeLocationId && isLegacyStoreName(order.storeLocationName)
    ? await getMainStore() : null;
  const effectiveOrderStore = order.storeLocationId || mainForReturn?.id;
  if (seller.role === "MANAGER" && (!effectiveOrderStore || seller.storeLocationId !== effectiveOrderStore)) {
    throw new Error("Managers can only process returns/refunds for their assigned store.");
  }
  const reason = cleanText(input.reason);
  if (!reason) throw new Error("Refund / return reason is required.");
  const alreadyRefunded = Number(order.refundedAmount || 0);
  const availableRefund = Math.max(0, Number(order.amountPaid || 0) - alreadyRefunded);
  const refundAmount = Number(input.refundAmount);
  if (!Number.isFinite(refundAmount) || refundAmount < 0 || refundAmount > availableRefund) throw new Error(`Refund amount must be between KES 0 and KES ${availableRefund.toLocaleString("en-KE")}.`);
  // Recording a non-Paystack refund does not transfer money. Require evidence that
  // payment was completed externally before changing financial reports.
  const manualRefund = refundAmount > 0 && order.paymentProvider?.toLowerCase() !== "paystack";
  const manualRefundReference = cleanText(input.manualRefundReference);
  if (manualRefund && (!input.manualRefundConfirmed || manualRefundReference.length < 4)) {
    throw new Error("Complete the refund outside the system and provide its receipt/reference before recording it.");
  }
  if (refundAmount === 0 && !input.restock && !input.cancelOutstanding) throw new Error("No refund, return, or balance adjustment was requested.");
  if (manualRefund) {
    const alreadyRecorded = await serverClient.fetch<number>(
      `count(*[_type == "returnTransaction" && manualRefundReference == $reference])`,
      { reference: manualRefundReference }, { cache: "no-store" },
    );
    if (alreadyRecorded > 0) throw new Error("This external refund reference has already been recorded. Verify the existing refund before proceeding.");
  }

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
  const products = productIds.length ? await serverClient.fetch<Array<{ _id: string; _rev: string; name?: string; initialStock?: number; variants?: Array<Record<string, unknown>>; inventory?: { _id?: string; locationBalances?: LocationBalance[] } | null }>>(
    `*[_type == "product" && _id in $ids]{
      _id,_rev,name,initialStock,variants,
      "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{
        _id,
        "locationBalances": locationBalances[]{_key,store,"storeId":coalesce(store._ref,storeId),"storeName":coalesce(store->name,storeName),"storeCode":coalesce(store->code,storeCode),onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}
      }
    }`, { ids: productIds }, { cache: "no-store" },
  ) : [];

  const now = new Date().toISOString();
  const key = `${order.orderNumber}|${now}|${refundAmount}|${reason}`;
  const returnId = `returnTransaction.${hashId(key)}`;
  const returnNumber = `RET-${hashId(key).slice(0, 12).toUpperCase()}`;
  const transaction = serverClient.transaction();
  const movements: Array<{ productId: string; productName: string; variantId?: string; quantityChange: number; stockBefore?: number; stockAfter?: number; destinationStoreId?: string; destination?: string }> = [];

  if (input.restock) {
    for (const product of products) {
      const rows = requestedItems.filter((row) => row.productId === product._id);
      const qty = rows.reduce((sum, row) => sum + row.quantity, 0);
      if (!qty) continue;
      const variantProduct = hasVariants(product.variants);
      const currentStock = variantProduct ? variantStockTotal(product.variants) : Math.max(0, Number(product.initialStock || 0));
      const nextVariants = variantProduct ? incrementVariantStock(product.variants, rows) : undefined;
      const nextStock = variantProduct
        ? variantStockTotal(nextVariants || product.variants)
        : currentStock + qty;
      transaction.patch(product._id, (patch) => patch.ifRevisionId(product._rev).set({ initialStock: nextStock, available: nextStock > 0, ...(nextVariants ? { variants: nextVariants } : {}) }));

      if (effectiveOrderStore) {
        if (!product.inventory?._id) throw new Error(`${product.name || "Product"} does not have a store inventory record for this return.`);
        const store = { id: effectiveOrderStore, name: order.storeLocationName || mainForReturn?.name || "Original store" };
        let nextBalances = product.inventory.locationBalances || [];
        for (const row of rows) {
          nextBalances = adjustLocationBalance(nextBalances, store, { onHandDelta: row.quantity, variantId: row.variantId });
        }
        transaction.patch(product.inventory._id, (patch) => patch.set({ location: "Multi-location", locationBalances: nextBalances }));
      }

      rows.forEach((row) => movements.push({ productId: product._id, productName: product.name || "Product", variantId: row.variantId, quantityChange: row.quantity, stockBefore: currentStock, stockAfter: nextStock, destinationStoreId: effectiveOrderStore, destination: order.storeLocationName || mainForReturn?.name }));
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
    manualRefundReference: manualRefund ? manualRefundReference : undefined,
    items: requestedItems.map((row, index) => {
      const soldLine = order.lineItems.find((line) => line.productId === row.productId && (!row.variantId || line.variantId === row.variantId));
      return { _key: `${index}-${safeId(row.productId)}`, _type: "object", product: { _type: "reference", _ref: row.productId }, productId: row.productId, name: soldLine?.name || "Product", variantId: row.variantId, quantity: row.quantity, unitPrice: Number(soldLine?.unitPrice || 0), unitCost: typeof soldLine?.unitCost === "number" ? soldLine.unitCost : undefined };
    }),
    processedBy: { _type: "reference", _ref: seller.id }, processedByName: seller.name, processedByRole: seller.role, createdAt: now,
  });
  addInventoryMovementsToTransaction({ transaction, movementKey: `return|${returnId}`, movementType: "RETURN", orderId: order.id, orderNumber: order.orderNumber, actor: seller, movements, note: reason, createdAt: now });
  transaction.createIfNotExists({
    _id: `auditEvent.${hashId(`return|${returnId}`)}`, _type: "auditEvent", eventNumber: `AUD-${hashId(`return|${returnId}`).slice(0, 12).toUpperCase()}`,
    eventType: "RETURN_REFUND_PROCESSED", entityType: "commerceOrder", entityId: order.id, entityLabel: order.orderNumber,
    actor: { _type: "reference", _ref: seller.id }, actorName: seller.name, actorRole: seller.role,
    detail: `${returnNumber} · refund KES ${refundAmount.toLocaleString("en-KE")} · ${input.restock ? "restocked" : "not restocked"} · ${manualRefund ? `external reference ${manualRefundReference} · ` : ""}${reason}`, createdAt: now,
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
  return serverClient.fetch<Array<{ id: string; eventNumber: string; eventType: string; entityLabel?: string; actorName?: string; actorRole?: string; detail?: string; createdAt: string; resolutionStatus?: "PENDING" | "RESOLVED"; resolvedAt?: string; resolvedBy?: string }>>(
    `*[_type == "auditEvent"] | order(createdAt desc)[0...$limit]{"id":_id,eventNumber,eventType,entityLabel,actorName,actorRole,detail,createdAt,resolutionStatus,resolvedAt,resolvedBy}`,
    { limit: Math.max(1, Math.min(500, limit)) }, { cache: "no-store" },
  );
}

export async function getDeveloperAuditTrail(days = 31) {
  const safeDays = Math.max(1, Math.min(93, Math.floor(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const [events, total] = await Promise.all([
    serverClient.fetch<Array<{ id: string; eventNumber: string; eventType: string; entityType?: string; entityId?: string; entityLabel?: string; actorName?: string; actorEmail?: string; actorRole?: string; detail?: string; createdAt: string; resolutionStatus?: "PENDING" | "RESOLVED"; resolvedAt?: string; resolvedBy?: string }>>(
      `*[_type == "auditEvent" && createdAt >= $since] | order(createdAt desc){"id":_id,eventNumber,eventType,entityType,entityId,entityLabel,actorName,"actorEmail":coalesce(actorEmail,actor->email),actorRole,detail,createdAt,resolutionStatus,resolvedAt,resolvedBy}`,
      { since }, { cache: "no-store" },
    ),
    serverClient.fetch<number>(`count(*[_type == "auditEvent"])`, {}, { cache: "no-store" }),
  ]);
  return { events, total };
}

export async function getPaymentReconciliation(limit = 200, storeId?: string) {
  const main = await getMainStore();
  const payments = await serverClient.fetch<Array<{ id: string; reference: string; orderNumber?: string; customerName?: string; customerPhone?: string; provider?: string; channel?: string; status: string; amount: number; providerTransactionId?: string; providerReceiptNumber?: string; processedByName?: string; failureReason?: string; createdAt: string; paidAt?: string; inventoryReviewRequired?: boolean; inventoryReconciliationReason?: string; storeLocationId?: string; storeLocationName?: string; isLegacyOnline?: boolean }>>(
    `*[_type == "paymentTransaction" && ${relatedOrderPredicate}] | order(createdAt desc)[0...$limit]{"id":_id,reference,orderNumber,customerName,customerPhone,provider,channel,status,amount,providerTransactionId,providerReceiptNumber,processedByName,failureReason,createdAt,paidAt,"storeLocationId":order->storeLocation._ref,"storeLocationName":coalesce(order->storeLocation->name,order->assignedStore,""),"isLegacyOnline":defined(order._ref) && coalesce(order->salesChannel,salesChannel,"ONLINE") == "ONLINE" && !defined(order->storeLocation._ref) && (!defined(order->assignedStore) || order->assignedStore in ["", "Company / online", "Company-wide", "Online"]),"inventoryReviewRequired":coalesce(order->inventoryReviewRequired,false),"inventoryReconciliationReason":coalesce(order->inventoryReconciliationReason,"")}`,
    { limit: Math.max(1, Math.min(500, limit)), storeId: cleanText(storeId) || null, mainStoreId: main?.id || null }, { cache: "no-store" },
  );
  return payments.map((payment) => payment.isLegacyOnline && !payment.storeLocationId && isLegacyStoreName(payment.storeLocationName) && main
    ? { ...payment, storeLocationId: main.id, storeLocationName: main.name }
    : payment);
}
