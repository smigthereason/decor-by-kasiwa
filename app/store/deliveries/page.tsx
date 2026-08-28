"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MapPin, PackageCheck, Search, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import { formatDateTime } from "@/lib/operations/selectors";

export default function DeliveriesPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const deliveries = useMemo(
    () => (data?.shipments || []).filter((shipment) => ["dispatched", "delivered"].includes(shipment.status)),
    [data?.shipments],
  );
  const filtered = deliveries.filter((shipment) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [shipment.shipmentNumber, shipment.orderNumber, shipment.customerName, shipment.destination]
      .some((value) => value.toLowerCase().includes(term));
  });

  async function confirmDelivery(id: string) {
    if (!confirmed[id]) {
      setMessage("Confirm that the order reached the intended destination before completing delivery.");
      return;
    }
    setSavingId(id);
    setMessage(null);
    try {
      await mutateBackoffice(
        `/api/backoffice/shipments/${encodeURIComponent(id)}/delivered`,
        { note: notes[id] || "" },
        "POST",
      );
      await refresh();
      setConfirmed((current) => ({ ...current, [id]: false }));
      setMessage("Delivery confirmed. The order is now marked delivered.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Delivery confirmation failed.");
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
        <p className="kicker text-[var(--muted)]">Deliveries</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Orders ready for delivery</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          An order appears here only after an Admin or Store Manager dispatches it. Confirm delivery after the order reaches the intended destination.
        </p>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>

      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deliveries..."
            className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
          />
        </div>
      </div>

      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((shipment) => {
              const delivered = shipment.status === "delivered";
              return (
                <article key={shipment.id} className="rounded-xl border hairline bg-[var(--paper)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.orderNumber}</p>
                      <h2 className="mt-1 text-base font-semibold">{shipment.customerName}</h2>
                    </div>
                    <StatusPill value={shipment.status} />
                  </div>
                  <p className="mt-4 flex items-start gap-2 border-t hairline pt-4 text-xs leading-5">
                    <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--muted)]" /> {shipment.destination}
                  </p>
                  {shipment.dispatchedAt && (
                    <p className="mt-2 text-[10px] text-[var(--muted)]">
                      Dispatched {formatDateTime(shipment.dispatchedAt)}{shipment.dispatchedByName ? ` by ${shipment.dispatchedByName}` : ""}
                    </p>
                  )}

                  {!delivered ? (
                    <>
                      <label className="mt-4 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        Delivery note (optional)
                      </label>
                      <textarea
                        rows={2}
                        value={notes[shipment.id] || ""}
                        onChange={(e) => setNotes((current) => ({ ...current, [shipment.id]: e.target.value }))}
                        placeholder="e.g. Received by customer at front desk"
                        className="mt-2 w-full rounded-lg border hairline bg-[var(--paper)] px-4 py-3 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
                      />
                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border hairline bg-[var(--paper-2)] p-3 text-xs leading-5">
                        <input
                          type="checkbox"
                          checked={Boolean(confirmed[shipment.id])}
                          onChange={(e) => setConfirmed((current) => ({ ...current, [shipment.id]: e.target.checked }))}
                          className="mt-1 size-4 accent-[var(--deep-green)]"
                        />
                        <span>I confirm this order reached the intended destination shown above.</span>
                      </label>
                      <button
                        type="button"
                        disabled={savingId === shipment.id || !confirmed[shipment.id]}
                        onClick={() => void confirmDelivery(shipment.id)}
                        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <PackageCheck size={14} /> {savingId === shipment.id ? "Confirming…" : "Confirm delivered"}
                      </button>
                    </>
                  ) : (
                    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={14} /> Delivery confirmed</p>
                      {shipment.deliveredAt && <p className="mt-1 text-[10px]">{formatDateTime(shipment.deliveredAt)}{shipment.deliveredByName ? ` · ${shipment.deliveredByName}` : ""}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
            <Truck size={32} className="mx-auto text-[var(--muted)]" />
            <p className="mt-4 text-sm font-medium">No delivery work waiting</p>
            <p className="mt-2 text-xs text-[var(--muted)]">Dispatched orders will appear here automatically.</p>
          </div>
        )}
      </section>
    </div>
  );
}
