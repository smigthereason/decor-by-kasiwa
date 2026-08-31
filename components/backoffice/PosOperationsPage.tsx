"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, CreditCard, FileClock, HandCoins, ReceiptText, RefreshCcw, RotateCcw, WalletCards } from "lucide-react";

import { formatMoney } from "@/lib/money";

type Tab = "history" | "reports" | "receivables" | "expenses" | "reconciliation" | "audit";
type HistoryOrder = {
  id: string; orderNumber: string; receiptNumber: string; customerName: string; customerPhone: string; customerEmail: string;
  salesChannel: "ONLINE" | "POS"; soldByName: string; soldAt: string; paymentStatus: string; paymentChannel: string;
  subtotal: number; discountAmount: number; total: number; amountPaid: number; balanceDue: number; refundedAmount: number;
  paymentReference: string; paymentProvider: string; providerReceiptNumber: string;
  lineItems: Array<{ productId: string; name: string; variantId?: string; quantity: number; unitPrice: number }>;
};
type Report = {
  period: "day" | "week" | "month"; totalSales: number; onlineSales: number; posSales: number; cashPayments: number; mpesaPayments: number; paystackPayments: number;
  outstandingReceivables: number; refunds: number; failedPayments: number; pendingPayments: number; orders: number;
  byDate: Array<{ date: string; orders: number; revenue: number }>;
  byProduct: Array<{ name: string; quantity: number; revenue: number }>;
  byCashier: Array<{ name: string; orders: number; revenue: number }>;
};
type Expense = { id: string; expenseNumber: string; expenseType: string; staffName?: string; description: string; amount: number; paymentMethod?: string; expenseDate: string; createdByName?: string };
type Payment = { id: string; reference: string; orderNumber?: string; provider?: string; channel?: string; status: string; amount: number; providerTransactionId?: string; providerReceiptNumber?: string; processedByName?: string; createdAt: string };
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
  const manager = role === "ADMIN" || role === "STORE";
  const [tab, setTab] = useState<Tab>("history");
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [receivables, setReceivables] = useState<HistoryOrder[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({ expenseType: "EXPENSE", staffName: "", description: "", amount: "", paymentMethod: "cash", transactionReference: "" });

  const load = useCallback(async (target: Tab = tab) => {
    setLoading(true); setMessage(null);
    try {
      const url = target === "history" ? "/api/backoffice/pos/history?limit=200"
        : target === "reports" ? `/api/backoffice/pos/reports?period=${period}`
          : target === "receivables" ? "/api/backoffice/pos/receivables"
            : target === "expenses" ? "/api/backoffice/pos/expenses"
              : target === "reconciliation" ? "/api/backoffice/pos/reconciliation"
                : "/api/backoffice/pos/audit";
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Unable to load POS operations.");
      if (target === "history") setOrders(payload.orders || []);
      if (target === "reports") setReport(payload.report || null);
      if (target === "receivables") setReceivables(payload.receivables || []);
      if (target === "expenses") setExpenses(payload.expenses || []);
      if (target === "reconciliation") setPayments(payload.payments || []);
      if (target === "audit") setAudit(payload.audit || []);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to load POS operations."); }
    finally { setLoading(false); }
  }, [period, tab]);

  useEffect(() => { void load(tab); }, [tab, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = useMemo(() => [
    { id: "history" as const, label: "Sales History", icon: ClipboardList },
    { id: "reports" as const, label: "Reports", icon: ReceiptText },
    { id: "receivables" as const, label: "Receivables", icon: HandCoins },
    ...(manager ? [
      { id: "expenses" as const, label: "Expenditure", icon: WalletCards },
      { id: "reconciliation" as const, label: "Reconciliation", icon: CreditCard },
      { id: "audit" as const, label: "Audit Trail", icon: FileClock },
    ] : []),
  ], [manager]);

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

  async function submitExpense(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/backoffice/pos/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.message || "Unable to record expenditure.");
    setMessage(`${payload.expenseNumber || "Expense"} recorded.`);
    setExpenseForm({ expenseType: "EXPENSE", staffName: "", description: "", amount: "", paymentMethod: "cash", transactionReference: "" });
    await load("expenses");
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <header className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="kicker text-[var(--muted)]">POS & Payment Integration</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">Sales Operations</h1><p className="mt-2 text-sm text-[var(--muted)]">Sales history, receivables, reporting, payments, returns and expenditure.</p></div>
            <Link href={`${basePath}/pos`} className="inline-flex min-h-11 items-center rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">New POS sale</Link>
          </div>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.06em] ${tab === id ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream" : "hairline bg-[var(--paper)]"}`}><Icon size={13} />{label}</button>)}
            <button type="button" onClick={() => void load(tab)} className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full border hairline" aria-label="Refresh"><RefreshCcw size={14} className={loading ? "animate-spin" : ""} /></button>
          </div>
          {message && <p role="status" className="mt-4 rounded-xl border hairline bg-[var(--paper-2)] px-4 py-3 text-xs">{message}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-10">
        {tab === "history" && <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-[var(--paper-2)] text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]"><tr><th className="p-4">Sale</th><th className="p-4">Customer</th><th className="p-4">Channel</th><th className="p-4">Cashier</th><th className="p-4">Total</th><th className="p-4">Paid / Balance</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody className="divide-y hairline">{orders.map((order) => <tr key={order.id}><td className="p-4"><p className="font-semibold">{order.orderNumber}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{order.soldAt ? new Date(order.soldAt).toLocaleString("en-KE") : ""}</p></td><td className="p-4"><p className="font-medium">{order.customerName}</p><p className="text-[10px] text-[var(--muted)]">{order.customerPhone}</p></td><td className="p-4">{order.salesChannel}<br/><span className="text-[10px] text-[var(--muted)]">{order.paymentChannel || "—"}</span></td><td className="p-4">{order.soldByName}</td><td className="p-4 font-semibold">{formatMoney(order.total)}</td><td className="p-4"><p>{formatMoney(order.amountPaid)}</p>{order.balanceDue > 0 && <p className="mt-1 text-amber-700">Due {formatMoney(order.balanceDue)}</p>}{order.refundedAmount > 0 && <p className="mt-1 text-blue-700">Refunded {formatMoney(order.refundedAmount)}</p>}</td><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${statusClass(order.paymentStatus)}`}>{order.paymentStatus.replaceAll("_", " ")}</span></td><td className="p-4"><div className="flex gap-2"><Link href={`${basePath}/pos/receipt/${encodeURIComponent(order.id)}`} className="rounded-full border hairline px-3 py-2 text-[9px] font-semibold uppercase">Receipt</Link>{manager && order.amountPaid - order.refundedAmount > 0 && <button type="button" onClick={() => void processRefund(order)} className="inline-flex items-center gap-1 rounded-full border hairline px-3 py-2 text-[9px] font-semibold uppercase"><RotateCcw size={11}/> Return</button>}</div></td></tr>)}{orders.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-[var(--muted)]">No sales found.</td></tr>}</tbody></table></div></div>}

        {tab === "reports" && report && <div className="space-y-6"><div className="flex gap-2">{(["day","week","month"] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`rounded-full px-4 py-2 text-[10px] font-semibold uppercase ${period === value ? "bg-[var(--deep-green)] !text-soft-cream" : "border hairline bg-[var(--paper)]"}`}>{value}</button>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ["Total sales", report.totalSales],["Online", report.onlineSales],["POS", report.posSales],["Cash", report.cashPayments],["M-PESA", report.mpesaPayments],["Paystack", report.paystackPayments],["Receivables", report.outstandingReceivables],["Refunds", report.refunds]
        ].map(([label,value]) => <div key={String(label)} className="rounded-2xl border hairline bg-[var(--paper)] p-5"><p className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{formatMoney(Number(value))}</p></div>)}</div><div className="grid gap-5 lg:grid-cols-3"><ReportTable title="Sales by date" headers={["Date","Orders","Revenue"]} rows={report.byDate.map((row)=>[row.date,String(row.orders),formatMoney(row.revenue)])}/><ReportTable title="Sales by product" headers={["Product","Qty","Revenue"]} rows={report.byProduct.map((row)=>[row.name,String(row.quantity),formatMoney(row.revenue)])}/><ReportTable title="Sales by cashier" headers={["Cashier","Orders","Revenue"]} rows={report.byCashier.map((row)=>[row.name,String(row.orders),formatMoney(row.revenue)])}/></div><p className="text-xs text-[var(--muted)]">Pending payments: {report.pendingPayments} · Failed payments: {report.failedPayments} · Orders in period: {report.orders}</p></div>}

        {tab === "receivables" && <div className="grid gap-3">{receivables.map((order) => <div key={order.id} className="flex flex-col gap-4 rounded-2xl border hairline bg-[var(--paper)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{order.customerName}</p><p className="mt-1 text-xs text-[var(--muted)]">{order.customerPhone} · {order.orderNumber}</p></div><div className="sm:text-right"><p className="text-[10px] uppercase text-[var(--muted)]">Outstanding</p><p className="mt-1 text-xl font-semibold text-amber-700">{formatMoney(order.balanceDue)}</p><button type="button" onClick={() => void recordReceivable(order)} className="mt-2 rounded-full bg-[var(--deep-green)] px-4 py-2 text-[9px] font-semibold uppercase !text-soft-cream">Record cash payment</button></div></div>)}{receivables.length === 0 && <p className="rounded-2xl border hairline bg-[var(--paper)] p-10 text-center text-sm text-[var(--muted)]">No outstanding receivables.</p>}</div>}

        {tab === "expenses" && manager && <div className="grid gap-6 lg:grid-cols-[380px_1fr]"><form onSubmit={submitExpense} className="rounded-2xl border hairline bg-[var(--paper)] p-5"><h2 className="text-lg font-semibold">Record expenditure</h2><div className="mt-4 grid gap-3"><select value={expenseForm.expenseType} onChange={(e)=>setExpenseForm({...expenseForm,expenseType:e.target.value})} className="min-h-11 rounded-lg border hairline bg-[var(--paper)] px-3 text-sm"><option value="EXPENSE">Business expense</option><option value="PETTY_CASH">Petty cash</option><option value="STAFF_PAYMENT">Staff payment</option><option value="SALARY">Salary</option></select><input value={expenseForm.staffName} onChange={(e)=>setExpenseForm({...expenseForm,staffName:e.target.value})} placeholder="Staff / payee name" className="min-h-11 rounded-lg border hairline px-3 text-sm"/><textarea value={expenseForm.description} onChange={(e)=>setExpenseForm({...expenseForm,description:e.target.value})} placeholder="Description" required className="min-h-24 rounded-lg border hairline p-3 text-sm"/><input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e)=>setExpenseForm({...expenseForm,amount:e.target.value})} placeholder="Amount (KES)" required className="min-h-11 rounded-lg border hairline px-3 text-sm"/><select value={expenseForm.paymentMethod} onChange={(e)=>setExpenseForm({...expenseForm,paymentMethod:e.target.value})} className="min-h-11 rounded-lg border hairline bg-[var(--paper)] px-3 text-sm"><option value="cash">Cash</option><option value="mpesa">M-PESA</option><option value="paystack">Bank / Paystack</option><option value="other">Other</option></select><input value={expenseForm.transactionReference} onChange={(e)=>setExpenseForm({...expenseForm,transactionReference:e.target.value})} placeholder="Transaction reference (optional)" className="min-h-11 rounded-lg border hairline px-3 text-sm"/><button className="min-h-11 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase !text-soft-cream">Save expenditure</button></div></form><div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">Staff / Payee</th><th className="p-4">Description</th><th className="p-4">Amount</th><th className="p-4">Recorded by</th></tr></thead><tbody className="divide-y hairline">{expenses.map((expense)=><tr key={expense.id}><td className="p-4">{new Date(expense.expenseDate).toLocaleDateString("en-KE")}</td><td className="p-4">{expense.expenseType.replaceAll("_"," ")}</td><td className="p-4">{expense.staffName || "—"}</td><td className="p-4">{expense.description}</td><td className="p-4 font-semibold">{formatMoney(expense.amount)}</td><td className="p-4">{expense.createdByName || "—"}</td></tr>)}</tbody></table></div></div></div>}

        {tab === "reconciliation" && manager && <SimpleTable headers={["Reference","Order","Provider","Channel","Status","Amount","Provider transaction","Processed by"]} rows={payments.map((p)=>[p.reference,p.orderNumber||"—",p.provider||"—",p.channel||"—",p.status,formatMoney(p.amount),p.providerReceiptNumber||p.providerTransactionId||"—",p.processedByName||"—"])} />}
        {tab === "audit" && manager && <SimpleTable headers={["Time","Event","Entity","Actor","Role","Detail"]} rows={audit.map((a)=>[new Date(a.createdAt).toLocaleString("en-KE"),a.eventType.replaceAll("_"," "),a.entityLabel||"—",a.actorName||"System",a.actorRole||"—",a.detail||"—"])} />}
      </main>
    </div>
  );
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><h3 className="p-4 font-semibold">{title}</h3><div className="overflow-x-auto"><table className="w-full min-w-[420px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr>{headers.map((h)=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y hairline">{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} className="p-3">{cell}</td>)}</tr>)}</tbody></table></div></div>; }
function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) { return <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-xs"><thead className="bg-[var(--paper-2)] text-left text-[10px] uppercase text-[var(--muted)]"><tr>{headers.map((h)=><th key={h} className="p-4">{h}</th>)}</tr></thead><tbody className="divide-y hairline">{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j} className="p-4">{cell}</td>)}</tr>)}</tbody></table></div></div>; }
