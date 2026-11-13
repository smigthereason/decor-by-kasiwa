"use client";

import { useEffect, useRef, useState } from "react";
import ExportButtons from "@/components/backoffice/ExportButtons";
import { formatMoney } from "@/lib/money";

type SalesReport = {
  start: string; end: string; period: "day" | "week" | "month" | "custom";
  grossSales: number; discountsAndReturns: number; netSales: number; costOfGoodsSold: number;
  grossProfit: number; operatingExpenses: number; operatingProfit: number;
  expenseBreakdown: Array<{ ledgerAccount: string; label: string; amount: number }>;
  byDate: Array<{ date: string; orders: number; revenue: number; deliveryPayables: number; moneyIn: number }>;
  byProduct: Array<{ name: string; quantity: number; revenue: number }>;
  byCashier: Array<{ name: string; orders: number; revenue: number }>;
};

type Kind = "pnl" | "date" | "product" | "cashier" | "weekly" | "monthly";
type TableRow = Record<string, string | number>;
const definitions: Array<{ kind: Kind; title: string; description: string }> = [
  { kind: "pnl", title: "Profit & Loss", description: "Completed sales, COGS and operating expenses" },
  { kind: "date", title: "Sales by date", description: "Sales grouped by trading date" },
  { kind: "product", title: "Sales by product", description: "Quantity and revenue by product" },
  { kind: "cashier", title: "Sales by cashier", description: "Orders and revenue attributed to staff" },
  { kind: "weekly", title: "Weekly sales overview", description: "Weekly totals for the requested range" },
  { kind: "monthly", title: "Monthly sales overview", description: "Monthly totals for the requested range" },
];

function weekBeginning(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function rowsFor(report: SalesReport, kind: Kind): TableRow[] {
  if (kind === "pnl") return [
    { item: "Gross sales", amount: report.grossSales },
    { item: "Discounts & returns", amount: -report.discountsAndReturns },
    { item: "Net sales", amount: report.netSales },
    { item: "Cost of goods sold", amount: -report.costOfGoodsSold },
    { item: "Gross profit", amount: report.grossProfit },
    ...report.expenseBreakdown.map((expense) => ({ item: `Expense · ${expense.label}`, amount: -expense.amount })),
    { item: "Total operating expenses", amount: -report.operatingExpenses },
    { item: "Operating profit", amount: report.operatingProfit },
  ];
  if (kind === "product") return report.byProduct.map((row) => ({ name: row.name, quantity: row.quantity, revenue: row.revenue }));
  if (kind === "cashier") return report.byCashier.map((row) => ({ name: row.name, orders: row.orders, revenue: row.revenue }));
  if (kind === "date") return report.byDate.map((row) => ({ period: row.date.slice(0, 10), orders: row.orders, revenue: row.revenue, delivery: row.deliveryPayables, moneyIn: row.moneyIn }));
  const grouped = new Map<string, TableRow>();
  for (const row of report.byDate) {
    const period = kind === "weekly" ? weekBeginning(row.date) : row.date.slice(0, 7);
    const previous = grouped.get(period) || { period, orders: 0, revenue: 0, delivery: 0, moneyIn: 0 };
    grouped.set(period, {
      period,
      orders: Number(previous.orders) + row.orders,
      revenue: Number(previous.revenue) + row.revenue,
      delivery: Number(previous.delivery) + row.deliveryPayables,
      moneyIn: Number(previous.moneyIn) + row.moneyIn,
    });
  }
  return [...grouped.values()].sort((a, b) => String(b.period).localeCompare(String(a.period)));
}

function ReportPanel({ kind, title, description, initial, storeId }: {
  kind: Kind; title: string; description: string; initial: SalesReport; storeId: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef<AbortController | null>(null);
  useEffect(() => () => latest.current?.abort(), []);

  const overview = kind === "weekly" || kind === "monthly";
  const current = custom || (overview ? null : initial);
  const allRows = current ? rowsFor(current, kind) : [];
  const rows = allRows.filter((row) => !search.trim() || Object.values(row).some((value) => String(value).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const keys = kind === "pnl" ? ["item", "amount"] : kind === "product" ? ["name", "quantity", "revenue"] : kind === "cashier" ? ["name", "orders", "revenue"] : ["period", "orders", "revenue", "delivery", "moneyIn"];
  const captions: Record<string, string> = { item: "Line item", amount: "Amount (KES)", name: kind === "product" ? "Product" : "Cashier", quantity: "Units", orders: "Orders", revenue: "Revenue (KES)", delivery: "Delivery payable (KES)", moneyIn: "Money in (KES)", period: kind === "weekly" ? "Week starting (Mon)" : kind === "monthly" ? "Month" : "Date" };
  const columns = keys.map((key) => ({ key, label: captions[key] }));
  const currencyKeys = new Set(["amount", "revenue", "delivery", "moneyIn"]);

  async function apply(useCurrent = false) {
    if (!useCurrent && (!from || !to || from > to)) {
      setError("Select both dates; From must not be later than To.");
      return;
    }
    latest.current?.abort();
    const controller = new AbortController(); latest.current = controller;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ period: kind === "monthly" ? "month" : kind === "weekly" ? "week" : "day" });
      if (!useCurrent) { query.set("from", from); query.set("to", to); }
      if (storeId) query.set("store", storeId);
      const response = await fetch(`/api/backoffice/pos/reports?${query}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json() as { report?: SalesReport; message?: string };
      if (!response.ok || !data.report) throw new Error(data.message || "Report could not be loaded.");
      if (!controller.signal.aborted) setCustom(data.report);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load this report.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border hairline bg-[var(--paper)] p-4 sm:p-5" aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-xs text-[var(--muted)]">{description}</p></div>
        <ExportButtons title={`${title} – ${current?.start?.slice(0, 10) || "report"} to ${current?.end?.slice(0, 10) || "report"}`} columns={columns} rows={rows} disabled={!current || loading}/>
      </header>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="grid gap-1 text-xs font-medium">From<input aria-label={`${title} from`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-10 w-full rounded-lg border hairline bg-white px-3"/></label>
        <label className="grid gap-1 text-xs font-medium">To<input aria-label={`${title} to`} type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-10 w-full rounded-lg border hairline bg-white px-3"/></label>
        <button type="button" disabled={loading} onClick={() => void apply()} className="min-h-10 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold text-white disabled:opacity-50">{loading ? "Loading…" : "Apply dates"}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="min-w-[180px] flex-1 text-xs font-medium">Search this report
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter visible rows" className="mt-1 min-h-10 w-full rounded-lg border hairline bg-white px-3 font-normal" />
        </label>
        {overview && <button type="button" disabled={loading} onClick={() => void apply(true)} className="min-h-10 self-end rounded-full border hairline px-4 text-xs font-semibold">Load current {kind === "weekly" ? "week" : "month"}</button>}
        {(custom || from || to || search) && <button type="button" onClick={() => { latest.current?.abort(); setCustom(null); setFrom(""); setTo(""); setSearch(""); setError(""); setLoading(false); }} className="min-h-10 self-end rounded-full border hairline px-4 text-xs font-semibold">Clear</button>}
      </div>
      {current && <p className="mt-3 text-[11px] text-[var(--muted)]">Period: {current.start.slice(0, 10)} – {current.end.slice(0, 10)} · {rows.length} matching rows. Each report has its own date range and exports.</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      {current ? (
        <div className="mt-4 overflow-x-auto rounded-xl border hairline">
          <table className="w-full min-w-[430px] text-left text-xs">
            <thead className="bg-[var(--paper-2)]"><tr>{columns.map((column) => <th key={column.key} className="px-3 py-3 font-semibold">{column.label}</th>)}</tr></thead>
            <tbody className="divide-y hairline">{rows.map((row, i) => <tr key={`${i}:${String(row[keys[0]])}`}>{keys.map((key) => <td key={key} className={`px-3 py-3 ${currencyKeys.has(key) ? "tabular-nums" : ""}`}>{currencyKeys.has(key) ? formatMoney(Number(row[key])) : row[key]}</td>)}</tr>)}</tbody>
          </table>
          {!rows.length && <p className="px-4 py-6 text-xs text-[var(--muted)]">No rows match this report&apos;s filters.</p>}
        </div>
      ) : <p className="mt-4 rounded-xl border hairline bg-[var(--paper-2)] p-5 text-xs text-[var(--muted)]">Choose a custom date range or load the current {kind === "weekly" ? "week" : "month"} overview.</p>}
      {kind === "pnl" && <p className="mt-3 text-[10px] text-[var(--muted)]">A search only hides displayed lines; it never recalculates financial totals. Exported figures retain the server-calculated ledger amounts.</p>}
    </section>
  );
}

export default function IndependentSalesReports({ initial, storeId }: { initial: SalesReport; storeId: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-label="Individual sales reports">
      {definitions.map((item) => <ReportPanel key={item.kind} {...item} initial={initial} storeId={storeId} />)}
    </div>
  );
}
