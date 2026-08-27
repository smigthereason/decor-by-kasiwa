"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Send, Package, Eye, Filter, Search } from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { orders as initialOrders } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(initialOrders);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "dispatched">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOrders = orders.filter((order) => {
    // Filter by status
    if (filter === "pending" && order.assignedStore) return false;
    if (filter === "dispatched" && !order.assignedStore) return false;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesOrder = order.orderNumber.toLowerCase().includes(term);
      const matchesCustomer = order.customerName.toLowerCase().includes(term);
      const matchesLocation = order.deliveryLocation.toLowerCase().includes(term);
      if (!matchesOrder && !matchesCustomer && !matchesLocation) return false;
    }

    return true;
  });

  function handleDispatchOrder(orderId: string) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status: "ready_for_store",
              assignedStore: "Kasiwa Main Store",
            }
          : order
      )
    );
    setDispatchMessage(`Order dispatched to Main Store for fulfilment.`);
    setTimeout(() => setDispatchMessage(null), 5000);
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">Orders</p>
        <h1 className="mt-2 text-3xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
          Customer Purchases
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Review, approve, and dispatch orders to the store for fulfilment.
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

      {/* FILTERS & SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["all", "All"],
              ["pending", "Pending"],
              ["dispatched", "Dispatched"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value as typeof filter)}
                className={`rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
                  filter === value
                    ? "bg-[var(--ink)] !text-white"
                    : "border hairline text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
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
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
            >
              {/* ORDER HEADER */}
              <div className="flex flex-col gap-3 border-b hairline p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)]">
                    <Package size={16} className="text-[var(--muted)]" />
                  </span>
                  <div>
                    <Link
                      href={`/admin/orders/${order.id}`}
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

              {/* ORDER BODY */}
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
                {/* LINE ITEMS */}
                <div className="space-y-2">
                  {order.lineItems.slice(0, 3).map((line) => (
                    <div key={line.id} className="flex justify-between gap-4 text-sm">
                      <span className="text-[var(--muted)]">
                        {line.quantity} × {line.name}
                      </span>
                      <span className="font-medium">
                        {formatKes(line.unitPrice * line.quantity)}
                      </span>
                    </div>
                  ))}
                  {order.lineItems.length > 3 && (
                    <p className="text-xs text-[var(--muted)]">
                      +{order.lineItems.length - 3} more items
                    </p>
                  )}
                </div>

                {/* TOTAL & ACTIONS */}
                <div className="flex flex-col gap-3 border-t hairline pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <div>
                    <p className="text-xs text-[var(--muted)]">Total</p>
                    <p className="text-lg font-semibold">{formatKes(order.total)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
                    >
                      <Eye size={12} />
                      View
                    </Link>

                    {!order.assignedStore ? (
                      <button
                        type="button"
                        onClick={() => handleDispatchOrder(order.id)}
                        className="group inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg"
                      >
                        <Send size={12} />
                        Dispatch
                        <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        <Check size={12} />
                        Dispatched
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* DELIVERY INFO */}
              <div className="border-t hairline bg-[var(--paper-2)]/50 px-4 py-3 sm:px-5">
                <p className="text-xs text-[var(--muted)]">
                  <strong>Delivery:</strong> {order.deliveryLocation}
                  {order.assignedStore ? ` · Assigned: ${order.assignedStore}` : ""}
                </p>
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
