"use client";

import { useState } from "react";
import { Search, ShoppingBag } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import OrderTable from "@/components/backoffice/OrderTable";
import { useLiveOperations } from "@/lib/operations/client";

export default function StoreOrdersPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const orders = (data?.orders || []).filter((order) =>
    ["ready_for_store", "picking", "packed", "dispatched", "delivered"].includes(order.status),
  );
  const filtered = orders.filter((order) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [order.orderNumber, order.customerName, order.deliveryLocation].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Order queue</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live store orders</h1><p className="mt-3 text-sm text-[var(--muted)]">Only real orders handed into the fulfilment workflow are shown.</p></div><div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="relative max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div></div><section className="p-4 sm:p-6 lg:p-8"><div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">{filtered.length ? <OrderTable orders={filtered} mode="store" /> : <div className="py-16 text-center"><ShoppingBag size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live store orders</p></div>}</div></section></div>;
}
