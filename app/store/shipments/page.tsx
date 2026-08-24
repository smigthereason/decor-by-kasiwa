"use client";

import { useState } from "react";
import {
  Search,
  Package,
  Boxes,
  CheckCircle2,
  Send,
  MapPin,
  X,
  Clock,
  ArrowRight,
  User,
  Hash,
  ChevronRight,
  Filter,
} from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";
import { formatDateTime } from "@/lib/operations/selectors";

type Shipment = (typeof shipments)[number];

const columns = [
  {
    status: "awaiting_store",
    label: "Receive",
    description: "Waiting for store to accept",
    icon: Package,
    accentColor: "border-amber-500",
    badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-500",
  },
  {
    status: "received",
    label: "Received",
    description: "Accepted by store team",
    icon: CheckCircle2,
    accentColor: "border-blue-500",
    badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    iconBg: "bg-blue-500",
  },
  {
    status: "picking",
    label: "Picking",
    description: "Being picked from inventory",
    icon: Boxes,
    accentColor: "border-purple-500",
    badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    iconBg: "bg-purple-500",
  },
  {
    status: "packed",
    label: "Packed",
    description: "Packed and ready for dispatch",
    icon: Package,
    accentColor: "border-orange-500",
    badgeColor: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    iconBg: "bg-orange-500",
  },
  {
    status: "ready_dispatch",
    label: "Dispatch Ready",
    description: "Ready for carrier handoff",
    icon: Send,
    accentColor: "border-emerald-500",
    badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    iconBg: "bg-emerald-500",
  },
] as const;

export default function StoreShipmentsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [mobileTab, setMobileTab] = useState<string>("all");

  const filteredShipments = shipments.filter((shipment) => {
    if (mobileTab !== "all" && shipment.status !== mobileTab) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      shipment.shipmentNumber.toLowerCase().includes(term) ||
      shipment.orderNumber.toLowerCase().includes(term) ||
      shipment.customerName.toLowerCase().includes(term) ||
      shipment.destination.toLowerCase().includes(term)
    );
  });

  const columnShipments = (status: string) =>
    filteredShipments.filter((shipment) => shipment.status === status);

  const visibleColumns =
    mobileTab === "all"
      ? columns
      : columns.filter((col) => col.status === mobileTab);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--paper-2)] text-[var(--ink)] antialiased">
      {/* PAGE HEADER */}
      <header className="sticky top-0 z-20 border-b hairline bg-[var(--paper)]/95 px-4 py-5 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Store Operations
              </span>
              <span className="text-[var(--muted)]">•</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink)]">
                {shipments.length} Active Workflows
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Shipment Board
            </h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search shipment, order, or customer..."
                className="w-full rounded-full border hairline bg-[var(--paper-2)] py-2 pl-10 pr-4 text-xs font-medium placeholder-[var(--muted)] outline-none transition-all focus:border-[var(--ink)] focus:bg-[var(--paper)] focus:ring-1 focus:ring-[var(--ink)]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MOBILE STAGE FILTER TABS */}
        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none lg:hidden">
          <button
            onClick={() => setMobileTab("all")}
            className={[
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
              mobileTab === "all"
                ? "bg-[var(--ink)] text-[var(--paper)]"
                : "bg-[var(--paper-2)] text-[var(--muted)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            All Stages ({shipments.length})
          </button>
          {columns.map((col) => {
            const count = shipments.filter((s) => s.status === col.status).length;
            return (
              <button
                key={col.status}
                onClick={() => setMobileTab(col.status)}
                className={[
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                  mobileTab === col.status
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "bg-[var(--paper-2)] text-[var(--muted)] hover:text-[var(--ink)]",
                ].join(" ")}
              >
                {col.label} ({count})
              </button>
            );
          })}
        </div>
      </header>

      {/* KANBAN BOARD CONTAINER */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto">
        <div className="flex gap-4 min-w-full lg:grid lg:grid-cols-5 lg:gap-4">
          {visibleColumns.map((column) => {
            const items = columnShipments(column.status);
            const Icon = column.icon;

            return (
              <div
                key={column.status}
                className="flex flex-col w-[300px] shrink-0 sm:w-[320px] lg:w-auto"
              >
                {/* Column Header */}
                <div
                  className={`mb-3 rounded-xl border-l-4 border-y border-r hairline bg-[var(--paper)] p-3.5 shadow-sm ${column.accentColor}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`grid size-8 place-items-center rounded-lg ${column.iconBg} text-white shadow-sm`}
                      >
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <div>
                        <h2 className="text-xs font-bold uppercase tracking-wider">
                          {column.label}
                        </h2>
                        <p className="text-[10px] text-[var(--muted)] line-clamp-1">
                          {column.description}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${column.badgeColor}`}
                    >
                      {items.length}
                    </span>
                  </div>
                </div>

                {/* Column Body / Cards List */}
                <div className="flex-1 space-y-3 rounded-xl bg-[var(--paper-2)]/60 p-1.5 min-h-[480px]">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed hairline bg-[var(--paper)]/50 p-8 text-center h-48">
                      <div className="grid size-10 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--muted)] mb-2">
                        <Icon size={18} strokeWidth={1.5} />
                      </div>
                      <p className="text-xs font-medium text-[var(--muted)]">
                        No shipments in {column.label.toLowerCase()}
                      </p>
                    </div>
                  ) : (
                    items.map((shipment) => (
                      <article
                        key={shipment.id}
                        onClick={() => setSelectedShipment(shipment)}
                        className="group relative rounded-xl border hairline bg-[var(--paper)] p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--ink)]/30 cursor-pointer"
                      >
                        {/* Top row: ID & Status Pill */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
                            {shipment.shipmentNumber}
                          </span>
                          <StatusPill value={shipment.status} />
                        </div>

                        {/* Order & Customer */}
                        <div className="mt-2.5">
                          <h3 className="text-sm font-semibold tracking-tight text-[var(--ink)]">
                            {shipment.orderNumber}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
                            <User size={12} />
                            <span className="truncate">{shipment.customerName}</span>
                          </div>
                        </div>

                        {/* Metadata Footer */}
                        <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-[11px] text-[var(--muted)]">
                          <span className="inline-flex items-center gap-1 font-medium bg-[var(--paper-2)] px-2 py-0.5 rounded-md">
                            <Package size={11} />
                            {shipment.totalUnits} {shipment.totalUnits === 1 ? "unit" : "units"}
                          </span>
                          <span className="flex items-center gap-1 truncate max-w-[130px]">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate">{shipment.destination}</span>
                          </span>
                        </div>

                        {/* Hover Affordance */}
                        <div className="mt-2.5 flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                          <span>View details</span>
                          <ChevronRight size={12} className="ml-0.5" />
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* SHIPMENT DETAIL DRAWER */}
      {selectedShipment && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedShipment(null)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-[var(--paper)] shadow-2xl transition-transform animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b hairline px-6 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  Shipment Details
                </p>
                <h2 className="text-lg font-semibold tracking-tight">
                  {selectedShipment.shipmentNumber}
                </h2>
              </div>
              <button
                onClick={() => setSelectedShipment(null)}
                className="grid size-8 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status Banner */}
              <div className="flex items-center justify-between rounded-xl border hairline bg-[var(--paper-2)] p-4">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Current Workflow Stage
                  </span>
                  <div className="mt-1">
                    <StatusPill value={selectedShipment.status} />
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Updated
                  </span>
                  <p className="text-xs font-medium text-[var(--ink)] mt-0.5">
                    {formatDateTime(selectedShipment.updatedAt)}
                  </p>
                </div>
              </div>

              {/* Order Info Cards */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Order Information
                </h3>
                <div className="rounded-xl border hairline p-4 space-y-3 bg-[var(--paper)]">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--muted)]">Order Ref:</span>
                    <span className="font-semibold">{selectedShipment.orderNumber}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t hairline pt-2">
                    <span className="text-[var(--muted)]">Customer:</span>
                    <span className="font-medium">{selectedShipment.customerName}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t hairline pt-2">
                    <span className="text-[var(--muted)]">Destination:</span>
                    <span className="font-medium">{selectedShipment.destination}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t hairline pt-2">
                    <span className="text-[var(--muted)]">Total Units:</span>
                    <span className="font-semibold">{selectedShipment.totalUnits} items</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
                  Quick Actions
                </h3>
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[var(--ink)] py-3 text-xs font-semibold text-[var(--paper)] transition-all hover:opacity-90 active:scale-[0.98]"
                >
                  <span>Advance Stage</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
