"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, Search, Send, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";

export default function StoreDispatchPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const orders = (data?.orders || []).filter(
    (order) => order.paymentStatus === "paid" && !order.dispatchedAt && !["dispatched", "delivered", "cancelled"].includes(order.status),
  );
  const filtered = orders.filter((order) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [order.orderNumber, order.customerName, order.deliveryLocation].some((value) => value.toLowerCase().includes(term));
  });

  async function dispatch(id: string) {
    setSavingId(id);
    setMessage(null);
    try {
      const result = await mutateBackoffice(`/api/backoffice/orders/${encodeURIComponent(id)}/dispatch`, {}, "POST");
      await refresh();
      setMessage(typeof result?.message === "string" ? result.message : "Order dispatched for delivery.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Dispatch failed.");
    } finally {
      setSavingId(null);
    }
  }

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Dispatch</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Dispatch paid orders to Sales Staff</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Review each order before dispatch. The server locks the first successful dispatch so the same order cannot be dispatched twice.</p>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative max-w-sm"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dispatch queue..." className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10" /></div>
      </div>
      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((order) => (
              <article key={order.id} className="rounded-xl border hairline bg-[var(--paper)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{order.orderNumber}</p><h2 className="mt-1 text-lg font-semibold">{order.customerName}</h2></div>
                  <StatusPill value={order.status} />
                </div>
                <p className="mt-4 border-t hairline pt-4 text-xs leading-5">{order.deliveryLocation}</p>
                <p className="mt-2 text-[10px] text-[var(--muted)]">{order.lineItems.length} line items · {order.customerPhone || "No phone supplied"}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href={`/store/orders/${encodeURIComponent(order.id)}`} className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border hairline px-4 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]">
                    Review <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                  <button disabled={savingId === order.id} type="button" onClick={() => void dispatch(order.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">
                    <Send size={13} /> {savingId === order.id ? "Saving…" : "Dispatch"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">Nothing waiting for dispatch</p><p className="mt-2 flex items-center justify-center gap-2 text-xs text-[var(--muted)]"><Check size={13} /> New paid orders will appear here automatically.</p></div>
        )}
      </section>
    </div>
  );
}
