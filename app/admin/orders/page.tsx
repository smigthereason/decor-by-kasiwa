"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, ShoppingBag } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import LiveDataState from "@/components/backoffice/LiveDataState";
import OrderTable from "@/components/backoffice/OrderTable";
import { useLiveOperations } from "@/lib/operations/client";

const NAIROBI_TIME_ZONE = "Africa/Nairobi";

function getNairobiDateTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NAIROBI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

export default function AdminOrdersPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");

  const orders = data?.orders || [];
  const statuses = useMemo(
    () => ["All", ...Array.from(new Set(orders.map((order) => order.status)))],
    [orders],
  );
  const filtered = orders.filter((order) => {
    if (status !== "All" && order.status !== status) return false;

    const placed = getNairobiDateTime(order.soldAt || order.createdAt);
    const hasDateTimeFilter = Boolean(fromDate || toDate || fromTime || toTime);
    if (hasDateTimeFilter && !placed) return false;
    if (placed) {
      if (fromDate && placed.date < fromDate) return false;
      if (toDate && placed.date > toDate) return false;

      // Time bounds apply to the edge date of a range. Without a date bound,
      // they act as a daily time-of-day filter across all loaded orders.
      if (fromTime && (!fromDate || placed.date === fromDate) && placed.time < fromTime) return false;
      if (toTime && (!toDate || placed.date === toDate) && placed.time > toTime) return false;
    }

    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return [
      order.orderNumber,
      order.customerName,
      order.customerEmail,
      order.customerPhone,
      order.soldByName || "",
    ].some((value) => value.toLowerCase().includes(term));
  });

  const clearFilters = () => {
    setSearch("");
    setStatus("All");
    setFromDate("");
    setToDate("");
    setFromTime("");
    setToTime("");
  };

  const hasActiveFilters = Boolean(search || status !== "All" || fromDate || toDate || fromTime || toTime);

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Orders</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live commerce orders</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          New paid orders appear here automatically. Review an order before dispatching it to Sales Staff for delivery.
        </p>
      </div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order, customer, phone, email or staff..." className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10" />
          </div>
          <div className="relative w-full lg:w-56">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10">
              {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          </div>
          <div className="lg:ml-auto"><ExportButtons title="Decor by Kasiwa Orders" columns={[{key:"order",label:"Order"},{key:"channel",label:"Channel"},{key:"customer",label:"Customer"},{key:"email",label:"Email"},{key:"status",label:"Status"},{key:"payment",label:"Payment"},{key:"total",label:"Total (KES)"},{key:"soldBy",label:"Sold By"},{key:"placed",label:"Placed"}]} rows={filtered.map((order)=>({order:order.orderNumber,channel:order.salesChannel||"ONLINE",customer:order.customerName,email:order.customerEmail,status:order.status,payment:order.paymentStatus,total:order.total,soldBy:order.soldByName||"Online checkout",placed:order.soldAt||order.createdAt}))}/></div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:max-w-5xl">
          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            From date
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-full border hairline bg-[var(--paper)] px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10" />
          </label>
          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            To date
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-full border hairline bg-[var(--paper)] px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10" />
          </label>
          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            From time
            <input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-full border hairline bg-[var(--paper)] px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10" />
          </label>
          <label className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            To time
            <input type="time" value={toTime} min={fromDate && toDate && fromDate === toDate ? fromTime || undefined : undefined} onChange={(e) => setToTime(e.target.value)} className="mt-1.5 min-h-11 w-full rounded-full border hairline bg-[var(--paper)] px-4 py-2.5 text-sm font-normal normal-case tracking-normal text-[var(--ink)] outline-none transition focus:border-[var(--brand-green)] focus:ring-2 focus:ring-[var(--brand-green)]/10" />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">Showing {filtered.length} of {orders.length} orders. Date and time filters use Kenya time.</p>
          {hasActiveFilters ? (
            <button type="button" onClick={clearFilters} className="rounded-full border hairline px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--brand-green)] hover:text-[var(--brand-green)]">
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          {filtered.length ? (
            <OrderTable orders={filtered} />
          ) : (
            <div className="py-16 text-center"><ShoppingBag size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live orders found</p></div>
          )}
        </div>
      </section>
    </div>
  );
}
