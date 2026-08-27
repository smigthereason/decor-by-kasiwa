"use client";

import { useState } from "react";
import { Search, Truck, Package, MapPin, Clock, Filter } from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";
import { formatDateTime } from "@/lib/operations/selectors";

export default function AdminShipmentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const filteredShipments = shipments.filter((shipment) => {
    if (statusFilter !== "All" && shipment.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesShipment = shipment.shipmentNumber.toLowerCase().includes(term);
      const matchesOrder = shipment.orderNumber.toLowerCase().includes(term);
      const matchesCustomer = shipment.customerName.toLowerCase().includes(term);
      const matchesDestination = shipment.destination.toLowerCase().includes(term);
      if (!matchesShipment && !matchesOrder && !matchesCustomer && !matchesDestination) return false;
    }
    return true;
  });

  const statuses = ["All", ...new Set(shipments.map((s) => s.status))];

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">Shipments</p>
        <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Order Shipments
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Track every fulfilment handoff between the admin office, the physical store and the delivery partner.
        </p>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all sm:px-4 sm:text-[10px] ${
                  statusFilter === status
                    ? "bg-[var(--ink)] !text-white"
                    : "border hairline text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search shipments..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
            />
          </div>
        </div>
      </div>

      {/* SHIPMENT CARDS */}
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {filteredShipments.map((shipment, index) => (
            <article
              key={shipment.id}
              className="group flex flex-col rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)]">
                    <Truck size={16} className="text-[var(--muted)]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{shipment.shipmentNumber}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {shipment.orderNumber}
                    </p>
                  </div>
                </div>
                <StatusPill value={shipment.status} />
              </div>

              {/* Customer */}
              <h2 className="mt-4 text-base font-semibold tracking-[-0.02em] sm:text-lg">
                {shipment.customerName}
              </h2>

              {/* Details */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-4">
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <MapPin size={11} />
                    Destination
                  </p>
                  <p className="mt-1.5 text-xs">{shipment.destination}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <Package size={11} />
                    Units
                  </p>
                  <p className="mt-1.5 text-xs">
                    {shipment.totalUnits} units · {shipment.itemCount} lines
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <Clock size={11} />
                    Last Update
                  </p>
                  <p className="mt-1.5 text-xs">{formatDateTime(shipment.updatedAt)}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <Truck size={11} />
                    Carrier
                  </p>
                  <p className="mt-1.5 text-xs">{shipment.carrier ?? "Not assigned"}</p>
                </div>
              </div>

              {/* Index number */}
              <div className="mt-4 border-t hairline pt-3">
                <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
            </article>
          ))}

          {filteredShipments.length === 0 && (
            <div className="col-span-full rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
              <Truck size={32} className="mx-auto text-[var(--muted)]" />
              <p className="mt-4 text-sm font-medium">No shipments found</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Try adjusting your filters or search term.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
