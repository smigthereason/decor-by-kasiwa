"use client";

import { useState } from "react";
import { Check, Search, Send, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";

export default function StoreDispatchPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shipments = (data?.shipments || []).filter((shipment) => ["packed", "ready_dispatch", "dispatched"].includes(shipment.status));
  const filtered = shipments.filter((shipment) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [shipment.shipmentNumber, shipment.orderNumber, shipment.customerName].some((value) => value.toLowerCase().includes(term));
  });

  async function dispatch(id: string) {
    setSavingId(id); setMessage(null);
    try { await mutateBackoffice(`/api/backoffice/shipments/${encodeURIComponent(id)}`, { status: "dispatched" }); await refresh(); setMessage("Shipment marked dispatched in Sanity."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Dispatch failed."); }
    finally { setSavingId(null); }
  }

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Dispatch</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live dispatch queue</h1><p className="mt-3 text-sm text-[var(--muted)]">Dispatch actions now update the shipment and related order in Sanity.</p>{message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}</div><div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="relative max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dispatch queue..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div></div><section className="p-4 sm:p-6 lg:p-8">{filtered.length ? <div className="grid gap-4 sm:grid-cols-2">{filtered.map((shipment) => <article key={shipment.id} className="rounded-xl border hairline bg-[var(--paper)] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.shipmentNumber} · {shipment.orderNumber}</p><h2 className="mt-1 text-lg font-semibold">{shipment.customerName}</h2></div><StatusPill value={shipment.status} /></div><p className="mt-4 border-t hairline pt-4 text-xs">{shipment.destination}</p><p className="mt-1 text-xs text-[var(--muted)]">{shipment.carrier || "Carrier not assigned"}{shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}</p>{shipment.status !== "dispatched" ? <button disabled={savingId === shipment.id} type="button" onClick={() => void dispatch(shipment.id)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white disabled:opacity-50"><Send size={13} /> {savingId === shipment.id ? "Saving…" : "Dispatch shipment"}</button> : <div className="mt-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-800"><Check size={14} /> Dispatched</div>}</article>)}</div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">Nothing waiting at dispatch</p></div>}</section></div>;
}
