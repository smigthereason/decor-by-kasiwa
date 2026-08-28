"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, ShoppingBag } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import OrderTable from "@/components/backoffice/OrderTable";
import { useLiveOperations } from "@/lib/operations/client";

export default function StoreOrdersPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const orders = (data?.orders || []).filter((order) =>
    ["ready_for_store", "picking", "packed", "dispatched", "delivered"].includes(order.status),
  );
  const statuses = useMemo(
    () => ["All", ...Array.from(new Set(orders.map((order) => order.status)))],
    [orders],
  );
  const filtered = orders.filter((order) => {
    if (status !== "All" && order.status !== status) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [order.orderNumber, order.customerName, order.deliveryLocation].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Order queue</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live store orders</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Review paid orders and dispatch them only after confirming the items and customer delivery details.</p>
      </div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders..." className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10" />
          </div>
          <div className="relative min-w-52">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10">
              {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          </div>
        </div>
      </div>
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          {filtered.length ? <OrderTable orders={filtered} mode="store" /> : <div className="py-16 text-center"><ShoppingBag size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live store orders</p></div>}
        </div>
      </section>
    </div>
  );
}
