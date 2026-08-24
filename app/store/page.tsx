"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  PackageCheck,
  PackageOpen,
  Truck,
  Search,
} from "lucide-react";
import { useState } from "react";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";
import { formatDateTime, storeMetrics } from "@/lib/operations/selectors";

export default function StoreDashboardPage() {
  const metrics = storeMetrics();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredShipments = shipments.filter((shipment) => {
    if (shipment.status === "delivered") return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      shipment.shipmentNumber.toLowerCase().includes(term) ||
      shipment.orderNumber.toLowerCase().includes(term) ||
      shipment.customerName.toLowerCase().includes(term) ||
      shipment.destination.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">Store Operations</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
              From shelf to doorstep.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              The physical fulfilment workspace. Receive admin-approved shipments, reserve stock, pick and pack items, then dispatch them for delivery.
            </p>
          </div>
          <Link
            href="/store/shipments"
            className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg sm:w-auto"
          >
            <span>Shipment queue</span>
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* METRICS */}
      <section className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-4 lg:p-8">
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <PackageOpen size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">01</span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Awaiting Receipt
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.awaitingReceipt).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Admin-approved shipments to accept
          </p>
        </article>

        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <Boxes size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">02</span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Picking
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.beingPicked).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Orders being picked from inventory
          </p>
        </article>

        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <PackageCheck size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">03</span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Ready Dispatch
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.readyToDispatch).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Packed shipments waiting for carrier
          </p>
        </article>

        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <Truck size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">04</span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Stock Attention
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.lowStock).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Inventory lines needing replenishment
          </p>
        </article>
      </section>

      {/* FULFILMENT QUEUE */}
      <section className="p-4 pt-0 sm:p-6 sm:pt-0 lg:p-8 lg:pt-0">
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="kicker text-[var(--muted)]">Fulfilment queue</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">
                What the store needs to move next.
              </h2>
            </div>
            <Link
              href="/store/shipments"
              className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              View queue
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-4 w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search shipments..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {filteredShipments.map((shipment) => (
              <article
                key={shipment.id}
                className="rounded-lg border hairline p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                      {shipment.shipmentNumber}
                    </p>
                    <h3 className="mt-1 text-base font-semibold tracking-[-0.02em]">
                      {shipment.orderNumber} · {shipment.customerName}
                    </h3>
                  </div>
                  <StatusPill value={shipment.status} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 border-t hairline pt-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      Destination
                    </p>
                    <p className="mt-1 text-xs">{shipment.destination}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      Units
                    </p>
                    <p className="mt-1 text-xs">{shipment.totalUnits}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      Updated
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {formatDateTime(shipment.updatedAt)}
                    </p>
                  </div>
                </div>
              </article>
            ))}

            {filteredShipments.length === 0 && (
              <div className="col-span-full rounded-lg border hairline bg-[var(--paper-2)] p-8 text-center">
                <Truck size={24} className="mx-auto text-[var(--muted)]" />
                <p className="mt-3 text-sm font-medium">No shipments in queue</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  All shipments have been processed.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
