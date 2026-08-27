"use client";

import { useMemo, useState } from "react";
import { Check, Package, Search, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { ShipmentStatus } from "@/lib/operations/types";

const workflow: ShipmentStatus[] = [
  "awaiting_store",
  "received",
  "picking",
  "packed",
  "ready_dispatch",
  "dispatched",
  "delivered",
  "exception",
];

export default function StoreShipmentsPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [savingId, setSavingId] = useState<string | null>(null);
  const shipments = data?.shipments || [];
  const statuses = useMemo(() => ["All", ...workflow], []);
  const filtered = shipments.filter((shipment) => {
    if (status !== "All" && shipment.status !== status) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [shipment.shipmentNumber, shipment.orderNumber, shipment.customerName, shipment.destination].some((value) => value.toLowerCase().includes(term));
  });

  async function updateStatus(id: string, next: ShipmentStatus) {
    setSavingId(id);
    try {
      await mutateBackoffice(`/api/backoffice/shipments/${encodeURIComponent(id)}`, { status: next });
      await refresh();
    } finally {
      setSavingId(null);
    }
  }

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Shipments</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live shipment workflow</h1><p className="mt-3 text-sm text-[var(--muted)]">Status changes here are persisted to Sanity and synchronised back to the order.</p></div><div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative max-w-sm flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shipments..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-full border hairline bg-[var(--paper)] px-4 text-sm">{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></div></div><section className="p-4 sm:p-6 lg:p-8">{filtered.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((shipment) => <article key={shipment.id} className="rounded-xl border hairline bg-[var(--paper)] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.shipmentNumber}</p><h2 className="mt-1 text-base font-semibold">{shipment.customerName}</h2><p className="mt-1 text-xs text-[var(--muted)]">{shipment.orderNumber}</p></div><StatusPill value={shipment.status} /></div><div className="mt-4 border-t hairline pt-4"><p className="text-xs">{shipment.destination}</p><p className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]"><Package size={12} /> {shipment.totalUnits} units</p></div><label className="mt-4 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Update workflow</label><select disabled={savingId === shipment.id} value={shipment.status} onChange={(e) => void updateStatus(shipment.id, e.target.value as ShipmentStatus)} className="mt-2 w-full rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm disabled:opacity-50">{workflow.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></article>)}</div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live shipments found</p><p className="mt-2 text-xs text-[var(--muted)]">Admin-created fulfilment shipments will appear here.</p></div>}</section></div>;
}
