"use client";

import { useState } from "react";
import { Truck, Search, Check, Send, ArrowRight} from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";

export default function StoreDispatchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);

  const dispatchable = shipments.filter((shipment) =>
    ["packed", "ready_dispatch", "dispatched"].includes(shipment.status)
  );

  const filteredShipments = dispatchable.filter((shipment) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      shipment.shipmentNumber.toLowerCase().includes(term) ||
      shipment.orderNumber.toLowerCase().includes(term) ||
      shipment.customerName.toLowerCase().includes(term)
    );
  });

  function handleDispatch(shipmentId: string) {
    setDispatchMessage(`Shipment dispatched successfully.`);
    setTimeout(() => setDispatchMessage(null), 5000);
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">Dispatch</p>
        <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Order Dispatch
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Assign the carrier, confirm the tracking reference and record when a packed shipment leaves the store.
        </p>
      </div>

      {/* DISPATCH MESSAGE */}
      {dispatchMessage && (
        <div className="border-b hairline bg-[var(--paper)] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <Check size={16} className="shrink-0" />
            {dispatchMessage}
          </div>
        </div>
      )}

      {/* SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search dispatch queue..."
            className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
          />
        </div>
      </div>

      {/* DISPATCH QUEUE */}
      <section className="p-4 sm:p-6 lg:p-8">
        {filteredShipments.length === 0 ? (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
            <Truck size={32} className="mx-auto text-[var(--muted)]" />
            <p className="mt-4 text-sm font-medium">Nothing waiting at the dispatch desk.</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Packed shipments will appear here when ready for carrier handoff.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {filteredShipments.map((shipment) => (
              <article
                key={shipment.id}
                className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      {shipment.shipmentNumber} · {shipment.orderNumber}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
                      {shipment.customerName}
                    </h2>
                  </div>
                  <StatusPill value={shipment.status} />
                </div>

                <div className="mt-4 border-t hairline pt-3">
                  <p className="text-xs">{shipment.destination}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {shipment.carrier ?? "Carrier not assigned"}
                    {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
                  </p>
                </div>

                {shipment.status !== "dispatched" ? (
                  <button
                    type="button"
                    onClick={() => handleDispatch(shipment.id)}
                    className="group mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg"
                  >
                    <Send size={13} />
                    Dispatch shipment
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                  </button>
                ) : (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="flex items-center gap-2">
                      <Check size={14} className="text-green-600" />
                      <p className="text-xs font-medium text-green-800">
                        Dispatched
                      </p>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
