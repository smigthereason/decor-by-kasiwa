"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Package, Search, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { ShipmentStatus } from "@/lib/operations/types";

const preparationWorkflow: ShipmentStatus[] = [
  "awaiting_store",
  "received",
  "picking",
  "packed",
  "ready_dispatch",
  "exception",
];

export default function StoreShipmentsPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shipments = data?.shipments || [];
  const statuses = useMemo(() => ["All", ...Array.from(new Set(shipments.map((item) => item.status)))], [shipments]);
  const filtered = shipments.filter((shipment) => {
    if (status !== "All" && shipment.status !== status) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [shipment.shipmentNumber, shipment.orderNumber, shipment.customerName, shipment.destination].some((value) => value.toLowerCase().includes(term));
  });

  async function updateStatus(id: string, next: ShipmentStatus) {
    setSavingId(id);
    setMessage(null);
    try {
      await mutateBackoffice(`/api/backoffice/shipments/${encodeURIComponent(id)}`, { status: next });
      await refresh();
      setMessage("Shipment preparation status updated.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Shipment update failed.");
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
        <p className="kicker text-[var(--muted)]">Shipments</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live shipment workflow</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Prepare shipments here. Dispatch happens from the order workflow, and delivery confirmation happens under Sales Staff Deliveries.</p>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shipments..." className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10" /></div>
          <div className="relative min-w-52">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10">
              {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          </div>
        </div>
      </div>
      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((shipment) => {
              const editable = preparationWorkflow.includes(shipment.status);
              return (
                <article key={shipment.id} className="rounded-xl border hairline bg-[var(--paper)] p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.shipmentNumber}</p><h2 className="mt-1 text-base font-semibold">{shipment.customerName}</h2><p className="mt-1 text-xs text-[var(--muted)]">{shipment.orderNumber}</p></div><StatusPill value={shipment.status} /></div>
                  <div className="mt-4 border-t hairline pt-4"><p className="text-xs">{shipment.destination}</p><p className="mt-2 flex items-center gap-2 text-[10px] text-[var(--muted)]"><Package size={12} /> {shipment.totalUnits} units</p></div>
                  {editable ? (
                    <>
                      <label className="mt-4 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Preparation status</label>
                      <div className="relative mt-2">
                        <select disabled={savingId === shipment.id} value={shipment.status} onChange={(e) => void updateStatus(shipment.id, e.target.value as ShipmentStatus)} className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] disabled:opacity-50">
                          {preparationWorkflow.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                      </div>
                    </>
                  ) : (
                    <p className="mt-4 text-[10px] leading-5 text-[var(--muted)]">This shipment is already in delivery/final state and cannot be moved backwards here.</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live shipments found</p></div>
        )}
      </section>
    </div>
  );
}
