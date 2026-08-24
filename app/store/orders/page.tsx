"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Eye, Package, ArrowRight } from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { orders } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function StoreOrdersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const storeOrders = orders.filter((order) => order.assignedStore);

  const filteredOrders = storeOrders.filter((order) => {
    if (statusFilter !== "All" && order.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        order.orderNumber.toLowerCase().includes(term) ||
        order.customerName.toLowerCase().includes(term) ||
        order.deliveryLocation.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const statuses = ["All", ...new Set(storeOrders.map((order) => order.status))];

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">Order Queue</p>
        <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Order Queue
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          The store sees only fulfilment-relevant orders that have been handed off by the admin office.
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
                {status === "All" ? "All" : status.replaceAll("_", " ")}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search orders..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
            />
          </div>
        </div>
      </div>

      {/* ORDERS LIST */}
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
            >
              <div className="flex flex-col gap-3 border-b hairline p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)]">
                    <Package size={16} className="text-[var(--muted)]" />
                  </span>
                  <div>
                    <Link
                      href={`/store/orders/${order.id}`}
                      className="text-sm font-semibold hover:underline underline-offset-4"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {order.customerName} · {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={order.status} />
                  <StatusPill value={order.paymentStatus} />
                </div>
              </div>

              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="space-y-1">
                  {order.lineItems.slice(0, 2).map((line) => (
                    <p key={line.id} className="text-xs text-[var(--muted)]">
                      {line.quantity} × {line.name}
                    </p>
                  ))}
                  {order.lineItems.length > 2 && (
                    <p className="text-xs text-[var(--muted)]">
                      +{order.lineItems.length - 2} more items
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-[var(--muted)]">Total</p>
                    <p className="text-lg font-semibold">{formatKes(order.total)}</p>
                  </div>
                  <Link
                    href={`/store/orders/${order.id}`}
                    className="group inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3"
                  >
                    <Eye size={12} />
                    View Pick List
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {filteredOrders.length === 0 && (
            <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
              <Package size={32} className="mx-auto text-[var(--muted)]" />
              <p className="mt-4 text-sm font-medium">No orders found</p>
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
