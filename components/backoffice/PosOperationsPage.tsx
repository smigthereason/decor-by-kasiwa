"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, CreditCard, FileClock, HandCoins, ReceiptText, RefreshCcw, RotateCcw, Search, WalletCards } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import { formatMoney } from "@/lib/money";

type Tab = "history" | "reports" | "receivables" | "expenses" | "reconciliation" | "audit";
type HistoryOrder = {
  id: string; orderNumber: string; receiptNumber: string; customerName: string; customerPhone: string; customerEmail: string;
  salesChannel: "ONLINE" | "POS"; soldByName: string; soldAt: string; paymentStatus: string; paymentChannel: string;
  storeLocationId?: string; storeLocationName?: string;
  subtotal: number; discountAmount: number; deliveryFee: number; deliveryLocation: string; total: number; amountPaid: number; balanceDue: number; cashTendered: number; cashChangeDue: number; refundedAmount: number;
  paymentReference: string; paymentProvider: string; providerReceiptNumber: string;
  lineItems: Array<{ productId: string; name: string; variantId?: string; quantity: number; unitPrice: number }>;
};
type Report = {
  period: "day" | "week" | "month" | "custom"; start: string; end: string; totalSales: number; moneyIn: number; deliveryPayables: number; onlineSales: number; posSales: number; manualPayments: number; mpesaPayments: number; paystackPayments: number;
  outstandingReceivables: number; refunds: number; failedPayments: number; pendingPayments: number; orders: number;
  byDate: Array<{ date: string; orders: number; revenue: number; deliveryPayables: number; moneyIn: number }>;
  byProduct: Array<{ name: string; quantity: number; revenue: number }>;
  byCashier: Array<{ name: string; orders: number; revenue: number }>;
  grossSales: number; discounts: number; returns: number; discountsAndReturns: number; netSales: number; costOfGoodsSold: number; grossProfit: number; operatingExpenses: number; operatingProfit: number;
  expenseBreakdown: Array<{ ledgerAccount: string; label: string; amount: number }>;
  cogsFallbackLines: number; cogsUncostedLines: number;
};
type Expense = { id: string; expenseNumber: string; expenseType: string; ledgerAccount: string; staffName?: string; description: string; amount: number; paymentMethod?: string; expenseDate: string; createdByName?: string; storeLocationId?: string; storeLocationName?: string; storeLocationCode?: string };
type Payment = { id: string; reference: string; orderNumber?: string; customerName?: string; customerPhone?: string; provider?: string; channel?: string; status: string; amount: number; providerTransactionId?: string; providerReceiptNumber?: string; processedByName?: string; failureReason?: string; createdAt: string; inventoryReviewRequired?: boolean; inventoryReconciliationReason?: string; storeLocationId?: string; storeLocationName?: string };
type StoreLocation = { _id: string; name: string; code?: string; locationType?: "MAIN" | "BRANCH" };
type ReconciliationResult = { state: "paid" | "failed" | "pending"; message: string; providerResultCode?: number; providerResponseCode?: string; providerResultDescription?: string; checkoutRequestId?: string; inventoryReviewRequired?: boolean; inventoryMessage?: string };
type Audit = { id: string; eventNumber: string; eventType: string; entityLabel?: string; actorName?: string; actorRole?: string; detail?: string; createdAt: string };

function statusClass(status: string) {
  if (["paid", "completed"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["failed", "cancelled"].includes(status)) return "bg-red-50 text-red-700";
  if (["partially_paid", "pending"].includes(status)) return "bg-amber-50 text-amber-700";
  if (status === "refunded") return "bg-blue-50 text-blue-700";
  return "bg-[var(--paper-2)] text-[var(--muted)]";
}

export default function PosOperationsPage({ basePath }: { basePath: "/admin" | "/store" }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const manager = role === "ADMIN" || role === "STORE" || role === "MANAGER";
  const canViewReports = role === "ADMIN" || role === "STORE";
  const salesStaff = role === "STORE_STAFF";
  const [storeLocations, setStoreLocations] = useState<StoreLocation[]>([]);
  const [assignedStoreId, setAssignedStoreId] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [tab, setTab] = useState<Tab>("history");
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [cashiers, setCashiers] = useState<string[]>([]);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyChannel, setHistoryChannel] = useState<"" | "POS" | "ONLINE">("");
  const [historyCashier, setHistoryCashier] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [appliedHistory, setAppliedHistory] = useState({ from: "", to: "", channel: "", cashier: "", search: "" });
  const [receivables, setReceivables] = useState<HistoryOrder[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [appliedReportFrom, setAppliedReportFrom] = useState("");
  const [appliedReportTo, setAppliedReportTo] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [reconcilingReference, setReconcilingReference] = useState<string | null>(null);
  const [reconciliationResults, setReconciliationResults] = useState<Record<string, ReconciliationResult>>({});
  const [reconciliationOrder, setReconciliationOrder] = useState("");
  const [reconciliationProvider, setReconciliationProvider] = useState("");
  const [reconciliationChannel, setReconciliationChannel] = useState("");
  const [reconciliationStatus, setReconciliationStatus] = useState("");
  const [reconciliationProcessedBy, setReconciliationProcessedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({ expenseType: "EXPENSE", ledgerAccount: "", expenseDate: "", staffName: "", description: "", amount: "", paymentMethod: "cash", transactionReference: "", storeLocationId: "" });

  useEffect(() => {
    void fetch("/api/backoffice/store-locations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { locations?: StoreLocation[]; assignedStoreId?: string };
        if (!response.ok) throw new Error("Unable to load stores.");
        const assigned = payload.assignedStoreId || "";
        setStoreLocations(payload.locations || []);
        setAssignedStoreId(assigned);
        if ((role === "MANAGER" || role === "STORE_STAFF") && assigned) {
          setStoreFilter(assigned);
          setExpenseForm((current) => ({ ...current, storeLocationId: assigned }));
        }
      })
      .catch(() => undefined);
  }, [role]);

  const storeLocked = Boolean(assignedStoreId && (role === "MANAGER" || role === "STORE_STAFF"));
  const selectedStore = storeLocations.find((location) => location._id === storeFilter);

  const load = useCallback(async (target: Tab = tab) => {
    setLoading(true); setMessage(null);
    try {
      const reportParams = new URLSearchParams({ period });
      if (storeFilter) reportParams.set("store", storeFilter);
      if (appliedReportFrom && appliedReportTo) {
        reportParams.set("from", appliedReportFrom);
        reportParams.set("to", appliedReportTo);
      }
      const historyParams = new URLSearchParams({ limit: "200" });
      if (storeFilter) historyParams.set("store", storeFilter);
      if (appliedHistory.from && appliedHistory.to) { historyParams.set("from", appliedHistory.from); historyParams.set("to", appliedHistory.to); }
      if (appliedHistory.channel) historyParams.set("channel", appliedHistory.channel);
      if (appliedHistory.cashier) historyParams.set("cashier", appliedHistory.cashier);
      if (appliedHistory.search) historyParams.set("q", appliedHistory.search);
      const url = target === "history" ? `/api/backoffice/pos/history?${historyParams.toString()}`
        : target === "reports" ? `/api/backoffice/pos/reports?${reportParams.toString()}`
          : target === "receivables" ? `/api/backoffice/pos/receivables${storeFilter ? `?store=${encodeURIComponent(storeFilter)}` : ""}`
            : target === "expenses" ? `/api/backoffice/pos/expenses${storeFilter ? `?store=${encodeURIComponent(storeFilter)}` : ""}`
              : target === "reconciliation" ? `/api/backoffice/pos/reconciliation${storeFilter ? `?store=${encodeURIComponent(storeFilter)}` : ""}`
                : "/api/backoffice/pos/audit";
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to load POS operations.");
      if (target === "history") { setOrders(payload.orders || []); setCashiers(payload.cashiers || []); }
      if (target === "reports") setReport(payload.report || null);
      if (target === "receivables") setReceivables(payload.receivables || []);
      if (target === "expenses") setExpenses(payload.expenses || []);
      if (target === "reconciliation") setPayments(payload.payments || []);
      if (target === "audit") setAudit(payload.audit || []);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to load POS operations."); }
    finally { setLoading(false); }
  }, [appliedHistory, appliedReportFrom, appliedReportTo, period, storeFilter, tab]);

  useEffect(() => {
    if (!canViewReports && tab === "reports") { setTab("history"); return; }
    if (salesStaff && tab !== "expenses") {
      setTab("expenses");
      return;
    }
    void load(tab);
  }, [tab, period, appliedHistory, appliedReportFrom, appliedReportTo, canViewReports, salesStaff, storeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const reconciliationProviders = useMemo(() => [...new Set(payments.map((payment) => payment.provider).filter((value): value is string => Boolean(value)))].sort(), [payments]);
  const reconciliationChannels = useMemo(() => [...new Set(payments.map((payment) => payment.channel).filter((value): value is string => Boolean(value)))].sort(), [payments]);
  const reconciliationStatuses = useMemo(() => [...new Set(payments.map((payment) => payment.status).filter(Boolean))].sort(), [payments]);
  const ledgerAccountSuggestions = useMemo(() => [...new Set(expenses.map((expense) => expense.ledgerAccount.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en-KE")), [expenses]);
  const reconciliationProcessors = useMemo(() => [...new Set(payments.map((payment) => payment.processedByName).filter((value): value is string => Boolean(value)))].sort(), [payments]);

  const relatedPaidAttempts = useMemo(() => {
    const normalizePhone = (value?: string) => (value || "").replace(/\D/g, "").slice(-9);
    const paid = payments.filter((payment) => payment.status === "paid" && payment.provider === "daraja" && normalizePhone(payment.customerPhone));
    const matches = new Map<string, Payment>();
    for (const payment of payments) {
      if (payment.status === "paid" || payment.provider !== "daraja") continue;
      const phone = normalizePhone(payment.customerPhone);
      if (!phone) continue;
      const createdAt = new Date(payment.createdAt).getTime();
      if (!Number.isFinite(createdAt)) continue;
      const candidates = paid
        .filter((candidate) => normalizePhone(candidate.customerPhone) === phone && Math.abs(candidate.amount - payment.amount) < 0.001)
        .map((candidate) => ({ candidate, distance: Math.abs(new Date(candidate.createdAt).getTime() - createdAt) }))
        .filter(({ distance }) => Number.isFinite(distance) && distance <= 15 * 60 * 1000)
        .sort((a, b) => a.distance - b.distance);
      if (candidates[0]) matches.set(payment.reference, candidates[0].candidate);
    }
    return matches;
  }, [payments]);

  const filteredPayments = useMemo(() => {
    const orderQuery = reconciliationOrder.trim().toLowerCase();
    return payments.filter((payment) => {
      const orderMatches = !orderQuery || [payment.orderNumber, payment.reference, payment.providerReceiptNumber, payment.providerTransactionId, payment.customerName, payment.customerPhone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(orderQuery));
      return orderMatches
        && (!reconciliationProvider || payment.provider === reconciliationProvider)
        && (!reconciliationChannel || payment.channel === reconciliationChannel)
        && (!reconciliationStatus || payment.status === reconciliationStatus)
        && (!reconciliationProcessedBy || payment.processedByName === reconciliationProcessedBy);
    });
  }, [payments, reconciliationOrder, reconciliationProvider, reconciliationChannel, reconciliationStatus, reconciliationProcessedBy]);

  function clearReconciliationFilters() {
    setReconciliationOrder("");
    setReconciliationProvider("");
    setReconciliationChannel("");
    setReconciliationStatus("");
    setReconciliationProcessedBy("");
  }

  const tabs = useMemo(() => salesStaff ? [
    { id: "expenses" as const, label: "Expenditure", icon: WalletCards },
  ] : [
    { id: "history" as const, label: "Sales History", icon: ClipboardList },
    ...(canViewReports ? [{ id: "reports" as const, label: "Reports", icon: ReceiptText }] : []),
    { id: "receivables" as const, label: "Receivables", icon: HandCoins },
    ...(manager ? [
      { id: "expenses" as const, label: "Expenditure", icon: WalletCards },
      { id: "reconciliation" as const, label: "Reconciliation", icon: CreditCard },
      { id: "audit" as const, label: "Audit Trail", icon: FileClock },
    ] : []),
  ], [canViewReports, manager, salesStaff]);

  async function recordReceivable(order: HistoryOrder) {
    const raw = window.prompt(`Outstanding balance is ${formatMoney(order.balanceDue)}. Enter cash amount received:`, String(order.balanceDue));
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage("Enter a valid payment amount.");
    const response = await fetch("/api/backoffice/pos/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, amount }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.message || "Unable to record payment.");
    setMessage("Outstanding payment recorded.");
    await load("receivables");
  }

  function applyHistoryFilters() {
    setMessage(null);
    if ((historyFrom && !historyTo) || (!historyFrom && historyTo)) {
      setMessage("Select both From and To dates when filtering sales history by date.");
      return;
    }
    if (historyFrom && historyTo && historyFrom > historyTo) {
      setMessage("The sales history From date cannot be after the To date.");
      return;
    }
    setAppliedHistory({ from: historyFrom, to: historyTo, channel: historyChannel, cashier: historyCashier, search: historySearch.trim() });
  }

  function clearHistoryFilters() {
    setMessage(null);
    setHistoryFrom(""); setHistoryTo(""); setHistoryChannel(""); setHistoryCashier(""); setHistorySearch("");
    setAppliedHistory({ from: "", to: "", channel: "", cashier: "", search: "" });
  }

  function applyReportDateRange() {
    setMessage(null);
    if (!reportFrom || !reportTo) {
      setMessage("Select both From and To dates before applying a custom report range.");
      return;
    }
    if (reportFrom > reportTo) {
      setMessage("The report From date cannot be after the To date.");
      return;
    }
    setAppliedReportFrom(reportFrom);
    setAppliedReportTo(reportTo);
  }

  function selectPresetPeriod(value: "day" | "week" | "month") {
    setMessage(null);
    setPeriod(value);
    setReportFrom("");
    setReportTo("");
    setAppliedReportFrom("");
    setAppliedReportTo("");
  }

  function clearReportDateRange() {
    setMessage(null);
    setReportFrom("");
    setReportTo("");
    setAppliedReportFrom("");
    setAppliedReportTo("");
  }

  async function processRefund(order: HistoryOrder) {
    if (!manager) return;
    const available = Math.max(0, order.amountPaid - order.refundedAmount);
    const raw = window.prompt(`Refundable amount: ${formatMoney(available)}. Enter refund amount (0 for return-only):`, String(available));
    if (raw === null) return;
    const refundAmount = Number(raw);
    const reason = window.prompt("Reason for return/refund:", "Customer return")?.trim();
    if (!reason) return;
    const restock = window.confirm("Restock all items from this order? Select Cancel to record refund without restocking.");
    const cancelOutstanding = order.balanceDue > 0 ? window.confirm("Clear the remaining outstanding balance as part of this return?") : false;
    const response = await fetch("/api/backoffice/pos/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, refundAmount, reason, restock, cancelOutstanding }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.message || "Unable to process return/refund.");
    setMessage(`${payload.returnNumber || "Return"} recorded successfully.`);
    await load("history");
  }

  async function reconcilePayment(payment: Payment) {
    if (!manager || payment.provider !== "daraja" || !payment.reference.startsWith("DBK-POS-")) return;
    setReconcilingReference(payment.reference);
    setMessage(null);
    try {
      const response = await fetch(`/api/backoffice/pos/verify?reference=${encodeURIComponent(payment.reference)}&forceProviderQuery=1`, { cache: "no-store" });
      const payload = await response.json() as { state?: "paid" | "failed" | "pending"; message?: string; order?: { orderNumber?: string; inventoryReviewRequired?: boolean; inventoryReconciliationReason?: string }; providerResultCode?: number; providerResponseCode?: string; providerResultDescription?: string; checkoutRequestId?: string; inventoryReviewRequired?: boolean; inventoryMessage?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to verify M-PESA payment.");
      const result: ReconciliationResult = {
        state: payload.state || "pending",
        message: payload.message || `Payment is ${payload.state || "pending"}.`,
        providerResultCode: payload.providerResultCode,
        providerResponseCode: payload.providerResponseCode,
        providerResultDescription: payload.providerResultDescription,
        checkoutRequestId: payload.checkoutRequestId,
        inventoryReviewRequired: payload.inventoryReviewRequired ?? payload.order?.inventoryReviewRequired,
        inventoryMessage: payload.inventoryMessage || payload.order?.inventoryReconciliationReason,
      };
      setReconciliationResults((current) => ({ ...current, [payment.reference]: result }));
      setMessage(result.state === "paid"
        ? result.inventoryReviewRequired
          ? `M-PESA confirmed for ${payload.order?.orderNumber || payment.orderNumber || payment.reference}. Payment is paid; inventory requires review.`
          : `M-PESA confirmed for ${payload.order?.orderNumber || payment.orderNumber || payment.reference}. Reconciliation has been updated.`
        : result.message);
      await Promise.all([load("reconciliation"), load("history"), load("reports")]);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to verify M-PESA payment.");
    } finally {
      setReconcilingReference(null);
    }
  }

  const exportData = useMemo(() => {
    if (tab === "history") return {
      title: `Sales History - ${selectedStore?.name || "All stores"}`,
      columns: [{key:"order",label:"Sale"},{key:"store",label:"Store"},{key:"customer",label:"Customer"},{key:"phone",label:"Phone"},{key:"channel",label:"Channel"},{key:"cashier",label:"Cashier"},{key:"revenue",label:"Business Revenue (KES)"},{key:"delivery",label:"Delivery Payable (KES)"},{key:"total",label:"Money In (KES)"},{key:"paid",label:"Paid (KES)"},{key:"balance",label:"Balance (KES)"},{key:"refunded",label:"Refunded (KES)"},{key:"status",label:"Status"},{key:"soldAt",label:"Sold At"}],
      rows: orders.map((order) => ({order:order.orderNumber,store:order.storeLocationName||"Company / online",customer:order.customerName,phone:order.customerPhone,channel:`${order.salesChannel} / ${order.paymentChannel || "—"}`,cashier:order.soldByName,revenue:Math.max(0,order.subtotal-order.discountAmount),delivery:order.deliveryFee,total:order.total,paid:order.amountPaid,balance:order.balanceDue,refunded:order.refundedAmount,status:order.paymentStatus,soldAt:order.soldAt})),
    };
    if (tab === "reports" && report) {
      const averageOrder = report.orders ? report.totalSales / report.orders : 0;
      return {
        title: `Sales Report - ${selectedStore?.name || "All stores"} - ${report.period}`,
        columns: [{key:"section",label:"Section"},{key:"name",label:"Name"},{key:"orders",label:"Orders"},{key:"quantity",label:"Quantity"},{key:"amount",label:"Amount / Revenue (KES)"}],
        rows: [
          {section:"TOTALS",name:"Business revenue",orders:report.orders,quantity:"",amount:report.totalSales},
          {section:"TOTALS",name:"Delivery payables",orders:"",quantity:"",amount:report.deliveryPayables},
          {section:"TOTALS",name:"Money In",orders:"",quantity:"",amount:report.moneyIn},
          {section:"TOTALS",name:"Average revenue per order",orders:"",quantity:"",amount:averageOrder},
          {section:"P&L",name:"Gross sales",orders:"",quantity:"",amount:report.grossSales},
          {section:"P&L",name:"Discounts and returns",orders:"",quantity:"",amount:report.discountsAndReturns},
          {section:"P&L",name:"Net sales",orders:"",quantity:"",amount:report.netSales},
          {section:"P&L",name:"Cost of goods sold",orders:"",quantity:"",amount:report.costOfGoodsSold},
          {section:"P&L",name:"Gross profit",orders:"",quantity:"",amount:report.grossProfit},
          ...report.expenseBreakdown.map((row)=>({section:"P&L OPERATING EXPENSE",name:row.label,orders:"",quantity:"",amount:row.amount})),
          {section:"P&L",name:"Total operating expenses",orders:"",quantity:"",amount:report.operatingExpenses},
          {section:"P&L",name:"Operating profit",orders:"",quantity:"",amount:report.operatingProfit},
          {section:"CHANNEL",name:"Online sales",orders:"",quantity:"",amount:report.onlineSales},
          {section:"CHANNEL",name:"POS sales",orders:"",quantity:"",amount:report.posSales},
          {section:"PAYMENT",name:"Manual / external",orders:"",quantity:"",amount:report.manualPayments},
          {section:"PAYMENT",name:"M-PESA",orders:"",quantity:"",amount:report.mpesaPayments},
          {section:"PAYMENT",name:"Paystack",orders:"",quantity:"",amount:report.paystackPayments},
          {section:"BALANCES",name:"Outstanding receivables",orders:"",quantity:"",amount:report.outstandingReceivables},
          {section:"BALANCES",name:"Refunds",orders:"",quantity:"",amount:report.refunds},
          ...report.byDate.map((row)=>({section:"BY DATE",name:row.date,orders:row.orders,quantity:"",amount:row.revenue})),
          ...report.byProduct.map((row)=>({section:"BY PRODUCT",name:row.name,orders:"",quantity:row.quantity,amount:row.revenue})),
          ...report.byCashier.map((row)=>({section:"BY CASHIER",name:row.name,orders:row.orders,quantity:"",amount:row.revenue})),
        ],
      };
    }
    if (tab === "receivables") return { title:`Receivables - ${selectedStore?.name || "All stores"}`, columns:[{key:"store",label:"Store"},{key:"customer",label:"Customer"},{key:"phone",label:"Phone"},{key:"order",label:"Order"},{key:"total",label:"Total (KES)"},{key:"paid",label:"Paid (KES)"},{key:"balance",label:"Outstanding (KES)"}], rows:receivables.map((order)=>({store:order.storeLocationName||"Company / online",customer:order.customerName,phone:order.customerPhone,order:order.orderNumber,total:order.total,paid:order.amountPaid,balance:order.balanceDue})) };
    if (tab === "expenses") return { title:`Expenditure and Petty Cash - ${selectedStore?.name || "All stores"}`, columns:[{key:"date",label:"Date"},{key:"store",label:"Store"},{key:"ledger",label:"Ledger Account"},{key:"type",label:"Type"},{key:"payee",label:"Staff / Payee"},{key:"description",label:"Description"},{key:"amount",label:"Amount (KES)"},{key:"method",label:"Payment Method"},{key:"recordedBy",label:"Recorded By"}], rows:expenses.map((expense)=>({date:expense.expenseDate,store:expense.storeLocationName||"Company-wide",ledger:expense.ledgerAccount,type:expense.expenseType,payee:expense.staffName||"—",description:expense.description,amount:expense.amount,method:expense.paymentMethod||"—",recordedBy:expense.createdByName||"—"})) };
    if (tab === "reconciliation") return { title:`Payment Reconciliation - ${selectedStore?.name || "All stores"}`, columns:[{key:"time",label:"Time"},{key:"store",label:"Store"},{key:"reference",label:"Reference"},{key:"order",label:"Order"},{key:"customer",label:"Customer"},{key:"phone",label:"Phone"},{key:"provider",label:"Provider"},{key:"channel",label:"Channel"},{key:"status",label:"Status"},{key:"amount",label:"Amount (KES)"},{key:"providerRef",label:"Provider Transaction"},{key:"processedBy",label:"Processed By"},{key:"relatedPaid",label:"Possible Paid Retry"},{key:"inventoryReview",label:"Inventory Review"}], rows:filteredPayments.map((payment)=>({time:payment.createdAt,store:payment.storeLocationName||"Company / online",reference:payment.reference,order:payment.orderNumber||"—",customer:payment.customerName||"—",phone:payment.customerPhone||"—",provider:payment.provider||"—",channel:payment.channel||"—",status:payment.status,amount:payment.amount,providerRef:payment.providerReceiptNumber||payment.providerTransactionId||"—",processedBy:payment.processedByName||"—",relatedPaid:relatedPaidAttempts.get(payment.reference)?.orderNumber||"—",inventoryReview:payment.inventoryReviewRequired ? payment.inventoryReconciliationReason || "Required" : "—"})) };
    return { title:"POS Audit Trail", columns:[{key:"time",label:"Time"},{key:"event",label:"Event"},{key:"entity",label:"Entity"},{key:"actor",label:"Actor"},{key:"role",label:"Role"},{key:"detail",label:"Detail"}], rows:audit.map((item)=>({time:item.createdAt,event:item.eventType,entity:item.entityLabel||"—",actor:item.actorName||"System",role:item.actorRole||"—",detail:item.detail||"—"})) };
  }, [audit, expenses, filteredPayments, orders, receivables, relatedPaidAttempts, report, selectedStore, tab]);

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/backoffice/pos/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.message || "Unable to record expenditure.");
    setMessage(`${payload.expenseNumber || "Expense"} recorded.`);
    setExpenseForm({ expenseType: "EXPENSE", ledgerAccount: "", expenseDate: "", staffName: "", description: "", amount: "", paymentMethod: "cash", transactionReference: "", storeLocationId: assignedStoreId || storeFilter || "" });
    await load("expenses");
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <header className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="kicker text-[var(--muted)]">POS & Payment Integration</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">Sales Operations</h1><p className="mt-2 text-sm text-[var(--muted)]">Sales history, receivables, reporting, payments, returns and expenditure.</p></div>
            <div className="flex flex-wrap items-center gap-2"><ExportButtons title={`Decor by Kasiwa ${exportData.title}`} columns={exportData.columns} rows={exportData.rows}/><Link href={`${basePath}/pos`} className="inline-flex min-h-11 items-center rounded-full bg-[var(--brand-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">New POS sale</Link></div>
          </div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.06em] ${tab === id ? "border-[var(--brand-green)] bg-[var(--brand-green)] !text-soft-cream" : "hairline bg-[var(--paper)]"}`}><Icon size={13} />{label}</button>)}
            <button type="button" onClick={() => void load(tab)} className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border hairline" aria-label="Refresh"><RefreshCcw size={14} className={loading ? "animate-spin" : ""} /></button>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="grid min-w-64 gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Store / location
              <span className="relative"><select value={storeFilter} disabled={storeLocked} onChange={(event)=>setStoreFilter(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)] disabled:opacity-70"><option value="">All stores</option>{storeLocations.map((store)=><option key={store._id} value={store._id}>{store.name}{store.locationType ? ` · ${store.locationType === "MAIN" ? "Main" : "Branch"}` : ""}{store.code ? ` · ${store.code}` : ""}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span>
            </label>
            <p className="pb-2 text-[10px] text-[var(--muted)]">{tab === "audit" ? "Audit remains company-wide." : selectedStore ? `Filtering ${selectedStore.name}.` : "Showing company-wide records."}</p>
          </div>
          {message && <p role="status" className="mt-4 rounded-xl border hairline bg-[var(--paper-2)] px-4 py-3 text-xs">{message}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-10">
        {tab === "history" && <div className="space-y-4">
          <div className="rounded-2xl border hairline bg-[var(--paper)] p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.4fr)_1fr_1fr_150px_200px_auto] lg:items-end">
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Search receipt / order / customer<div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/><input value={historySearch} onChange={(event)=>setHistorySearch(event.target.value)} onKeyDown={(event)=>{ if(event.key === "Enter") applyHistoryFilters(); }} placeholder="Order, receipt, name or phone" className="min-h-10 w-full rounded-lg border hairline bg-[var(--paper)] py-2 pl-9 pr-3 text-xs font-normal normal-case text-[var(--ink)]" /></div></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">From<input type="date" value={historyFrom} onChange={(event)=>setHistoryFrom(event.target.value)} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">To<input type="date" value={historyTo} onChange={(event)=>setHistoryTo(event.target.value)} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Channel<span className="relative"><select value={historyChannel} onChange={(event)=>setHistoryChannel(event.target.value as ""|"POS"|"ONLINE")} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All channels</option><option value="POS">POS</option><option value="ONLINE">Online</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Cashier<span className="relative"><select value={historyCashier} onChange={(event)=>setHistoryCashier(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All cashiers</option>{cashiers.map((cashier)=><option key={cashier} value={cashier}>{cashier}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <div className="flex gap-2"><button type="button" onClick={applyHistoryFilters} className="min-h-10 rounded-full bg-[var(--brand-green)] px-4 text-[9px] font-semibold uppercase tracking-[0.05em] !text-soft-cream">Search</button><button type="button" onClick={clearHistoryFilters} className="min-h-10 rounded-full border hairline px-4 text-[9px] font-semibold uppercase tracking-[0.05em]">Clear</button></div>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {orders.map((order) => <article key={order.id} className="rounded-2xl border hairline bg-[var(--paper)] p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{order.orderNumber}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{order.soldAt ? new Date(order.soldAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : ""}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${statusClass(order.paymentStatus)}`}>{order.paymentStatus.replaceAll("_", " ")}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><DataPoint label="Store" value={order.storeLocationName || "Company / online"} /><DataPoint label="Customer" value={`${order.customerName} · ${order.customerPhone}`} /><DataPoint label="Channel" value={`${order.salesChannel} · ${order.paymentChannel || "—"}`} /><DataPoint label="Cashier" value={order.soldByName || "—"} /><DataPoint label="Revenue" value={formatMoney(Math.max(0, order.subtotal - order.discountAmount))} /><DataPoint label="Delivery" value={order.deliveryFee > 0 ? `${formatMoney(order.deliveryFee)} · ${order.deliveryLocation}` : "—"} /><DataPoint label="Money In" value={formatMoney(order.total)} /></div>
              {order.refundedAmount > 0 && <p className="mt-3 text-[10px] text-blue-700">Refunded {formatMoney(order.refundedAmount)}</p>}
              <div className="mt-4 flex flex-wrap gap-2"><Link href={`${basePath}/pos/receipt/${encodeURIComponent(order.id)}`} className="inline-flex min-h-10 items-center rounded-full border hairline px-4 text-[9px] font-semibold uppercase">Print receipt</Link>{manager && order.amountPaid - order.refundedAmount > 0 && <button type="button" onClick={() => void processRefund(order)} className="inline-flex min-h-10 items-center gap-1 rounded-full border hairline px-4 text-[9px] font-semibold uppercase"><RotateCcw size={11}/> Return</button>}</div>
            </article>)}
            {orders.length === 0 && <p className="rounded-2xl border hairline bg-[var(--paper)] p-8 text-center text-sm text-[var(--muted)]">No sales match the selected filters.</p>}
          </div>
          <div className="hidden overflow-hidden rounded-2xl border hairline bg-[var(--paper)] md:block"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-[var(--paper-2)] text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]"><tr><th className="p-4">Sale</th><th className="p-4">Store</th><th className="p-4">Customer</th><th className="p-4">Channel</th><th className="p-4">Cashier</th><th className="p-4">Revenue</th><th className="p-4">Delivery</th><th className="p-4">Money In</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody className="divide-y hairline">{orders.map((order) => <tr key={order.id}><td className="p-4"><p className="font-semibold">{order.orderNumber}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{order.soldAt ? new Date(order.soldAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : ""}</p></td><td className="p-4">{order.storeLocationName || "Company / online"}</td><td className="p-4"><p className="font-medium">{order.customerName}</p><p className="text-[10px] text-[var(--muted)]">{order.customerPhone}</p></td><td className="p-4">{order.salesChannel}<br/><span className="text-[10px] text-[var(--muted)]">{order.paymentChannel || "—"}</span></td><td className="p-4">{order.soldByName}</td><td className="p-4 font-semibold">{formatMoney(Math.max(0,order.subtotal-order.discountAmount))}</td><td className="p-4">{order.deliveryFee > 0 ? <><p>{formatMoney(order.deliveryFee)}</p><p className="text-[10px] text-[var(--muted)]">{order.deliveryLocation}</p></> : "—"}</td><td className="p-4 font-semibold">{formatMoney(order.total)}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${statusClass(order.paymentStatus)}`}>{order.paymentStatus.replaceAll("_", " ")}</span>{order.refundedAmount > 0 && <p className="mt-2 text-[10px] text-blue-700">Refunded {formatMoney(order.refundedAmount)}</p>}</td><td className="p-4"><div className="flex gap-2"><Link href={`${basePath}/pos/receipt/${encodeURIComponent(order.id)}`} className="rounded-full border hairline px-3 py-2 text-[9px] font-semibold uppercase">Print receipt</Link>{manager && order.amountPaid - order.refundedAmount > 0 && <button type="button" onClick={() => void processRefund(order)} className="inline-flex items-center gap-1 rounded-full border hairline px-3 py-2 text-[9px] font-semibold uppercase"><RotateCcw size={11}/> Return</button>}</div></td></tr>)}{orders.length === 0 && <tr><td colSpan={10} className="p-10 text-center text-[var(--muted)]">No sales match the selected filters.</td></tr>}</tbody></table></div></div>
        </div>}

        {tab === "reports" && report && <div className="space-y-6">
          <div className="rounded-2xl border hairline bg-[var(--paper)] p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-2">{(["day","week","month"] as const).map((value) => <button key={value} type="button" onClick={() => selectPresetPeriod(value)} className={`rounded-full px-4 py-2 text-[10px] font-semibold uppercase ${report.period !== "custom" && period === value ? "bg-[var(--brand-green)] !text-soft-cream" : "border hairline bg-[var(--paper)]"}`}>{value}</button>)}</div>
              <div className="ml-0 flex flex-wrap items-end gap-2 lg:ml-auto">
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">From<input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">To<input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
                <button type="button" onClick={applyReportDateRange} className="min-h-10 rounded-full bg-[var(--brand-green)] px-4 text-[9px] font-semibold uppercase tracking-[0.05em] !text-soft-cream">Apply dates</button>
                {(appliedReportFrom || appliedReportTo) && <button type="button" onClick={clearReportDateRange} className="min-h-10 rounded-full border hairline px-4 text-[9px] font-semibold uppercase tracking-[0.05em]">Clear</button>}
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">{selectedStore ? `${selectedStore.name} · ` : "All stores · "}{report.period === "custom" ? `Showing ${new Date(report.start).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })} – ${new Date(report.end).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" })}` : `Showing ${report.period} report`}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Business revenue", formatMoney(report.totalSales)],["Delivery payables", formatMoney(report.deliveryPayables)],["Money In", formatMoney(report.moneyIn)],["Total orders", String(report.orders)],["Average revenue / order", formatMoney(report.orders ? report.totalSales/report.orders : 0)],["Online revenue", formatMoney(report.onlineSales)],["POS revenue", formatMoney(report.posSales)],["Manual payment money in", formatMoney(report.manualPayments)],["M-PESA money in", formatMoney(report.mpesaPayments)],["Paystack money in", formatMoney(report.paystackPayments)],["Receivables", formatMoney(report.outstandingReceivables)],["Refunds", formatMoney(report.refunds)]
        ].map(([label,value]) => <div key={String(label)} className="rounded-2xl border hairline bg-[var(--paper)] p-5"><p className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><ProfitLossStatement report={report}/><div className="grid gap-5 lg:grid-cols-3"><ReportTable title="Sales by date" headers={["Date","Orders","Revenue","Delivery","Money In"]} rows={report.byDate.map((row)=>[row.date,String(row.orders),formatMoney(row.revenue),formatMoney(row.deliveryPayables),formatMoney(row.moneyIn)])} totalRow={["TOTAL",String(report.byDate.reduce((sum,row)=>sum+row.orders,0)),formatMoney(report.byDate.reduce((sum,row)=>sum+row.revenue,0)),formatMoney(report.byDate.reduce((sum,row)=>sum+row.deliveryPayables,0)),formatMoney(report.byDate.reduce((sum,row)=>sum+row.moneyIn,0))]}/><ReportTable title="Sales by product" headers={["Product","Qty","Revenue"]} rows={report.byProduct.map((row)=>[row.name,String(row.quantity),formatMoney(row.revenue)])} totalRow={["TOTAL",String(report.byProduct.reduce((sum,row)=>sum+row.quantity,0)),formatMoney(report.byProduct.reduce((sum,row)=>sum+row.revenue,0))]}/><ReportTable title="Sales by cashier" headers={["Cashier","Orders","Revenue"]} rows={report.byCashier.map((row)=>[row.name,String(row.orders),formatMoney(row.revenue)])} totalRow={["TOTAL",String(report.byCashier.reduce((sum,row)=>sum+row.orders,0)),formatMoney(report.byCashier.reduce((sum,row)=>sum+row.revenue,0))]}/></div><p className="text-xs text-[var(--muted)]">Pending payments: {report.pendingPayments} · Failed payments: {report.failedPayments} · Total orders in period: {report.orders}</p></div>}

        {tab === "receivables" && <div className="grid gap-3">{receivables.map((order) => <div key={order.id} className="flex flex-col gap-4 rounded-2xl border hairline bg-[var(--paper)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{order.customerName}</p><p className="mt-1 text-xs text-[var(--muted)]">{order.customerPhone} · {order.orderNumber}{order.storeLocationName ? ` · ${order.storeLocationName}` : ""}</p></div><div className="sm:text-right"><p className="text-[10px] uppercase text-[var(--muted)]">Outstanding</p><p className="mt-1 text-xl font-semibold text-amber-700">{formatMoney(order.balanceDue)}</p><p className="mt-2 text-[10px] text-[var(--muted)]">Historical outstanding balance. New POS sales are cashless.</p></div></div>)}{receivables.length === 0 && <p className="rounded-2xl border hairline bg-[var(--paper)] p-10 text-center text-sm text-[var(--muted)]">No outstanding receivables.</p>}</div>}

        {tab === "expenses" && (manager || salesStaff) && <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <form onSubmit={submitExpense} className="rounded-2xl border hairline bg-[var(--paper)] p-5">
            <h2 className="text-lg font-semibold">Record expenditure</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">Record the actual ledger account used by the business. Profit &amp; Loss reads operating-expense rows directly from Expenditure and only shows ledger accounts that have transactions in the selected report period.</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Expense type
                <span className="relative"><select value={expenseForm.expenseType} onChange={(e)=>setExpenseForm({...expenseForm,expenseType:e.target.value,ledgerAccount:e.target.value === "SALARY" && !expenseForm.ledgerAccount.trim() ? "Salaries" : expenseForm.ledgerAccount})} className="min-h-11 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-sm font-normal normal-case text-[var(--ink)]"><option value="EXPENSE">Business expense</option><option value="PETTY_CASH">Petty cash</option><option value="STAFF_PAYMENT">Staff payment</option><option value="SALARY">Salary</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span>
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Store / location
                <span className="relative"><select value={expenseForm.storeLocationId} disabled={storeLocked} onChange={(e)=>setExpenseForm({...expenseForm,storeLocationId:e.target.value})} className="min-h-11 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-sm font-normal normal-case text-[var(--ink)] disabled:opacity-70"><option value="">Company-wide / not store-specific</option>{storeLocations.map((store)=><option key={store._id} value={store._id}>{store.name}{store.locationType ? ` · ${store.locationType === "MAIN" ? "Main" : "Branch"}` : ""}{store.code ? ` · ${store.code}` : ""}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span>
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Ledger Account
                <input list="expense-ledger-accounts" value={expenseForm.ledgerAccount} onChange={(e)=>setExpenseForm({...expenseForm,ledgerAccount:e.target.value})} placeholder="e.g. Rent, Salaries, Marketing, Electricity" required className="min-h-11 rounded-lg border hairline bg-[var(--paper)] px-3 text-sm font-normal normal-case text-[var(--ink)]"/>
                <datalist id="expense-ledger-accounts">{ledgerAccountSuggestions.map((account)=><option key={account} value={account}/>)}</datalist>
                <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">Use an existing ledger account or type a new one. Only accounts with expenditure in the selected report period appear in P&amp;L.</span>
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Expense date
                <input type="date" value={expenseForm.expenseDate} onChange={(e)=>setExpenseForm({...expenseForm,expenseDate:e.target.value})} className="min-h-11 rounded-lg border hairline bg-[var(--paper)] px-3 text-sm font-normal normal-case text-[var(--ink)]"/>
              </label>
              <input value={expenseForm.staffName} onChange={(e)=>setExpenseForm({...expenseForm,staffName:e.target.value})} placeholder="Staff / payee name" className="min-h-11 rounded-lg border hairline px-3 text-sm"/>
              <textarea value={expenseForm.description} onChange={(e)=>setExpenseForm({...expenseForm,description:e.target.value})} placeholder="Description" required className="min-h-24 rounded-lg border hairline p-3 text-sm"/>
              <input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e)=>setExpenseForm({...expenseForm,amount:e.target.value})} placeholder="Amount (KES)" required className="min-h-11 rounded-lg border hairline px-3 text-sm"/>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Payment method
                <span className="relative"><select value={expenseForm.paymentMethod} onChange={(e)=>setExpenseForm({...expenseForm,paymentMethod:e.target.value})} className="min-h-11 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-sm font-normal normal-case text-[var(--ink)]"><option value="cash">Cash</option><option value="mpesa">M-PESA</option><option value="paystack">Bank / Paystack</option><option value="other">Other</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span>
              </label>
              <input value={expenseForm.transactionReference} onChange={(e)=>setExpenseForm({...expenseForm,transactionReference:e.target.value})} placeholder="Transaction reference (optional)" className="min-h-11 rounded-lg border hairline px-3 text-sm"/>
              <button className="min-h-11 rounded-full bg-[var(--brand-green)] px-5 text-[10px] font-semibold uppercase !text-soft-cream">Save expenditure</button>
            </div>
          </form>
          <SimpleTable headers={["Date","Store","Ledger Account","Type","Staff / Payee","Description","Amount","Recorded by"]} rows={expenses.map((expense)=>[new Date(expense.expenseDate).toLocaleDateString("en-KE"),expense.storeLocationName || "Company-wide",expense.ledgerAccount,expense.expenseType.replaceAll("_"," "),expense.staffName || "—",expense.description,formatMoney(expense.amount),expense.createdByName || "—"])} />
        </div>}

        {tab === "reconciliation" && manager && <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]">
          <div className="border-b hairline p-4">
            <p className="text-xs text-[var(--muted)]">A failed row is a failed STK attempt, not automatically missing money. If staff prompted the same phone again and a matching amount was paid within 15 minutes, the row is flagged as a <strong>possible paid retry</strong>. The failed attempt remains failed because the successful payment belongs to its own Safaricom CheckoutRequestID.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_160px_170px_160px_210px_auto] xl:items-end">
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Order / reference<input value={reconciliationOrder} onChange={(event)=>setReconciliationOrder(event.target.value)} placeholder="Order, reference, customer or phone" className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Provider<span className="relative"><select value={reconciliationProvider} onChange={(event)=>setReconciliationProvider(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All providers</option>{reconciliationProviders.map((value)=><option key={value} value={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Channel<span className="relative"><select value={reconciliationChannel} onChange={(event)=>setReconciliationChannel(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All channels</option>{reconciliationChannels.map((value)=><option key={value} value={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Status<span className="relative"><select value={reconciliationStatus} onChange={(event)=>setReconciliationStatus(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All statuses</option>{reconciliationStatuses.map((value)=><option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">Processed by<span className="relative"><select value={reconciliationProcessedBy} onChange={(event)=>setReconciliationProcessedBy(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] pl-4 pr-11 text-xs font-normal normal-case text-[var(--ink)]"><option value="">All staff</option>{reconciliationProcessors.map((value)=><option key={value} value={value}>{value}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" /></span></label>
              <button type="button" onClick={clearReconciliationFilters} className="min-h-10 rounded-full border hairline px-4 text-[9px] font-semibold uppercase tracking-[0.05em]">Clear</button>
            </div>
            <p className="mt-3 text-[10px] text-[var(--muted)]">Showing {filteredPayments.length} of {payments.length} recent payment records.</p>
          </div>
          <div className="grid gap-3 p-3 md:hidden">{filteredPayments.map((payment) => { const canVerify = payment.provider === "daraja" && payment.reference.startsWith("DBK-POS-") && payment.status !== "paid"; const canRetryInventory = payment.provider === "daraja" && payment.reference.startsWith("DBK-POS-") && payment.status === "paid" && payment.inventoryReviewRequired; const result = reconciliationResults[payment.reference]; const relatedPaid = relatedPaidAttempts.get(payment.reference); return <div key={payment.id} className="rounded-xl border hairline p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{payment.orderNumber || payment.reference}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{new Date(payment.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{payment.reference}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${statusClass(payment.status)}`}>{payment.status.replaceAll("_", " ")}</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><DataPoint label="Store" value={payment.storeLocationName || "Company / online"} /><DataPoint label="Customer" value={`${payment.customerName || "—"} · ${payment.customerPhone || "—"}`} /><DataPoint label="Provider" value={`${payment.provider || "—"} · ${payment.channel || "—"}`} /><DataPoint label="Amount" value={formatMoney(payment.amount)} /><DataPoint label="Provider ref" value={payment.providerReceiptNumber || payment.providerTransactionId || "—"} /><DataPoint label="Processed by" value={payment.processedByName || "—"} /><DataPoint label="Failure reason" value={payment.failureReason || "—"} /></div>{relatedPaid && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800"><p className="font-semibold uppercase">Possible paid retry</p><p className="mt-1">Same phone and amount was paid on {relatedPaid.orderNumber || relatedPaid.reference} at {new Date(relatedPaid.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}. Do not mark this failed attempt paid.</p></div>}{payment.inventoryReviewRequired && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><p className="font-semibold uppercase">Paid · inventory review required</p><p className="mt-1">{payment.inventoryReconciliationReason || "Stock could not be reconciled after the confirmed payment."}</p></div>}{(canVerify || canRetryInventory) && <button type="button" disabled={reconcilingReference === payment.reference} onClick={() => void reconcilePayment(payment)} className="mt-4 min-h-10 rounded-full border border-[var(--brand-green)] px-4 text-[9px] font-semibold uppercase text-[var(--brand-green)] disabled:opacity-50">{reconcilingReference === payment.reference ? "Working…" : canRetryInventory ? "Retry Inventory" : "Verify M-PESA"}</button>}{result && <div className={`mt-3 rounded-lg px-3 py-2 text-[10px] ${result.inventoryReviewRequired ? "bg-amber-50 text-amber-800" : result.state === "paid" ? "bg-emerald-50 text-emerald-800" : result.state === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}><p className="font-semibold uppercase">Safaricom result: {result.state}</p><p className="mt-1 leading-4">{result.message}</p>{typeof result.providerResultCode === "number" && <p className="mt-1">ResultCode: {result.providerResultCode}</p>}</div>}</div>; })}{filteredPayments.length === 0 && <p className="rounded-xl border hairline p-6 text-center text-xs text-[var(--muted)]">No reconciliation records match the selected filters.</p>}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1560px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr>{["Time","Store","Reference","Order","Customer","Provider","Channel","Status","Amount","Provider transaction","Processed by","Action / Safaricom result"].map((header)=><th key={header} className="p-4">{header}</th>)}</tr></thead><tbody className="divide-y hairline">{filteredPayments.map((payment) => { const canVerify = payment.provider === "daraja" && payment.reference.startsWith("DBK-POS-") && payment.status !== "paid"; const canRetryInventory = payment.provider === "daraja" && payment.reference.startsWith("DBK-POS-") && payment.status === "paid" && payment.inventoryReviewRequired; const result = reconciliationResults[payment.reference]; const relatedPaid = relatedPaidAttempts.get(payment.reference); return <tr key={payment.id}><td className="p-4 whitespace-nowrap">{new Date(payment.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</td><td className="p-4">{payment.storeLocationName || "Company / online"}</td><td className="p-4 font-medium">{payment.reference}</td><td className="p-4">{payment.orderNumber || "—"}</td><td className="p-4"><p>{payment.customerName || "—"}</p><p className="text-[10px] text-[var(--muted)]">{payment.customerPhone || "—"}</p></td><td className="p-4">{payment.provider || "—"}</td><td className="p-4">{payment.channel || "—"}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${statusClass(payment.status)}`}>{payment.status.replaceAll("_", " ")}</span>{payment.failureReason && <p className="mt-2 max-w-[220px] text-[10px] leading-4 text-[var(--muted)]">{payment.failureReason}</p>}</td><td className="p-4">{formatMoney(payment.amount)}</td><td className="p-4">{payment.providerReceiptNumber || payment.providerTransactionId || "—"}</td><td className="p-4">{payment.processedByName || "—"}</td><td className="p-4 align-top">{relatedPaid && <div className="mb-2 max-w-[320px] rounded-lg bg-emerald-50 px-3 py-2 text-[10px] leading-4 text-emerald-800"><p className="font-semibold uppercase">Possible paid retry</p><p>Same phone + amount paid on {relatedPaid.orderNumber || relatedPaid.reference} at {new Date(relatedPaid.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}.</p></div>}{payment.inventoryReviewRequired && <div className="mb-2 max-w-[320px] rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800"><p className="font-semibold uppercase">Paid · inventory review required</p><p>{payment.inventoryReconciliationReason || "Stock could not be reconciled after the confirmed payment."}</p></div>}{canVerify || canRetryInventory ? <button type="button" disabled={reconcilingReference === payment.reference} onClick={() => void reconcilePayment(payment)} className="rounded-full border border-[var(--brand-green)] px-3 py-2 text-[9px] font-semibold uppercase text-[var(--brand-green)] disabled:opacity-50">{reconcilingReference === payment.reference ? "Working…" : canRetryInventory ? "Retry Inventory" : "Verify M-PESA"}</button> : "—"}{result && <div className={`mt-2 max-w-[320px] rounded-lg px-3 py-2 text-[10px] leading-4 ${result.inventoryReviewRequired ? "bg-amber-50 text-amber-800" : result.state === "paid" ? "bg-emerald-50 text-emerald-800" : result.state === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}><p className="font-semibold uppercase">Safaricom result: {result.state}</p><p className="mt-1">{result.message}</p>{typeof result.providerResultCode === "number" && <p className="mt-1">ResultCode: {result.providerResultCode}</p>}</div>}</td></tr>; })}{filteredPayments.length === 0 && <tr><td colSpan={12} className="p-10 text-center text-[var(--muted)]">No reconciliation records match the selected filters.</td></tr>}</tbody></table></div>
        </div>}
        {tab === "audit" && manager && <SimpleTable headers={["Time","Event","Entity","Actor","Role","Detail"]} rows={audit.map((a)=>[new Date(a.createdAt).toLocaleString("en-KE"),a.eventType.replaceAll("_"," "),a.entityLabel||"—",a.actorName||"System",a.actorRole||"—",a.detail||"—"])} />}
      </main>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{label}</p><p className="mt-1 break-words text-xs font-medium">{value}</p></div>; }

function MobileDataCards({ headers, rows, totalRow }: { headers: string[]; rows: string[][]; totalRow?: string[] }) {
  return <div className="grid gap-3 md:hidden">{rows.map((row, index) => <div key={index} className="rounded-xl border hairline bg-[var(--paper)] p-4"><div className="grid grid-cols-2 gap-x-4 gap-y-3">{row.map((cell, cellIndex) => <DataPoint key={`${index}-${cellIndex}`} label={headers[cellIndex] || `Field ${cellIndex + 1}`} value={cell} />)}</div></div>)}{rows.length === 0 && <p className="rounded-xl border hairline bg-[var(--paper)] p-6 text-center text-xs text-[var(--muted)]">No records available.</p>}{totalRow && <div className="rounded-xl border hairline bg-[var(--paper-2)] p-4 font-semibold"><div className="grid grid-cols-2 gap-x-4 gap-y-3">{totalRow.map((cell, cellIndex) => <DataPoint key={`total-${cellIndex}`} label={headers[cellIndex] || `Field ${cellIndex + 1}`} value={cell} />)}</div></div>}</div>;
}

function ReportTable({ title, headers, rows, totalRow }: { title: string; headers: string[]; rows: string[][]; totalRow?: string[] }) { return <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><h3 className="p-4 font-semibold">{title}</h3><div className="px-3 pb-3 md:hidden"><MobileDataCards headers={headers} rows={rows} totalRow={totalRow}/></div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[420px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr>{headers.map((header)=><th key={header} className="p-3">{header}</th>)}</tr></thead><tbody className="divide-y hairline">{rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td key={cellIndex} className="p-3">{cell}</td>)}</tr>)}{totalRow&&<tr className="bg-[var(--paper-2)] font-bold">{totalRow.map((cell,cellIndex)=><td key={cellIndex} className="p-3">{cell}</td>)}</tr>}</tbody></table></div></div>; }
function ProfitLossStatement({ report }: { report: Report }) {
  const operatingProfitClass = report.operatingProfit >= 0 ? "text-emerald-700" : "text-red-700";
  const summary = [
    { label: "Net sales", value: report.netSales },
    { label: "Gross profit", value: report.grossProfit },
    { label: "Operating profit", value: report.operatingProfit },
  ];
  const StatementRow = ({ label, amount, strong = false, negative = false, highlight = false }: { label: string; amount: number; strong?: boolean; negative?: boolean; highlight?: boolean }) => (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-5 py-3 text-sm ${strong ? "font-semibold" : ""} ${highlight ? "bg-[var(--paper-2)]" : ""}`}>
      <span className={strong ? "text-[var(--ink)]" : "text-[var(--muted)]"}>{label}</span>
      <span className={`min-w-[120px] text-right tabular-nums ${strong ? "text-[var(--ink)]" : ""}`}>{negative && amount !== 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)}</span>
    </div>
  );

  return <section className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]">
    <div className="border-b hairline p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker text-[var(--muted)]">Profit &amp; Loss</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Operating statement</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">Revenue comes from completed sales. Cost of goods sold uses product procurement cost. Operating expenses are fetched from Expenditure ledger accounts for this report period; ledger accounts with no transactions are not displayed.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {summary.map((item) => <div key={item.label} className="rounded-xl border hairline bg-[var(--paper-2)] px-4 py-3"><p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{item.label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${item.label === "Operating profit" ? operatingProfitClass : ""}`}>{formatMoney(item.value)}</p></div>)}
      </div>
      {report.cogsFallbackLines > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">{report.cogsFallbackLines} historical sale/return line{report.cogsFallbackLines === 1 ? "" : "s"} did not contain a cost snapshot, so this report uses the product&apos;s current procurement cost for those lines. New sales snapshot procurement cost at the time of sale.</p>}
      {report.cogsUncostedLines > 0 && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-800">{report.cogsUncostedLines} sale/return line{report.cogsUncostedLines === 1 ? " has" : "s have"} no procurement cost greater than zero. COGS and profit may be understated until those product costs are completed.</p>}
    </div>

    <div className="divide-y hairline">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-6 bg-[var(--paper-2)] px-5 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><span>Statement item</span><span className="min-w-[120px] text-right">Amount</span></div>

      <div>
        <div className="px-5 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Revenue</div>
        <StatementRow label="Gross sales" amount={report.grossSales}/>
        <StatementRow label="Discounts and returns" amount={report.discountsAndReturns} negative/>
        <StatementRow label="Net sales" amount={report.netSales} strong highlight/>
      </div>

      <div>
        <div className="px-5 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Cost of sales</div>
        <StatementRow label="Cost of goods sold" amount={report.costOfGoodsSold}/>
        <StatementRow label="Gross profit" amount={report.grossProfit} strong highlight/>
      </div>

      <div>
        <div className="px-5 pb-1 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Operating expenses</div>
        {report.expenseBreakdown.length > 0
          ? report.expenseBreakdown.map((row) => <StatementRow key={row.ledgerAccount} label={row.label} amount={row.amount}/>)
          : <div className="px-5 py-3 text-xs text-[var(--muted)]">No operating expenditure was recorded for this period.</div>}
        <StatementRow label="Total operating expenses" amount={report.operatingExpenses} strong highlight/>
      </div>

      <div className="bg-[var(--paper-2)]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-5 py-4">
          <span className="text-base font-bold">Operating profit</span>
          <span className={`min-w-[120px] text-right text-lg font-bold tabular-nums ${operatingProfitClass}`}>{formatMoney(report.operatingProfit)}</span>
        </div>
      </div>
    </div>
    <div className="border-t hairline px-5 py-3 text-[10px] text-[var(--muted)]">Discounts: {formatMoney(report.discounts)} · Returns: {formatMoney(report.returns)}</div>
  </section>;
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><div className="p-3 md:hidden"><MobileDataCards headers={headers} rows={rows}/></div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr>{headers.map((header)=><th key={header} className="p-4">{header}</th>)}</tr></thead><tbody className="divide-y hairline">{rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td key={cellIndex} className="p-4">{cell}</td>)}</tr>)}</tbody></table></div></div>; }
