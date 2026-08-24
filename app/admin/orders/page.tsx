"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Send, Package, Eye } from "lucide-react";
import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { orders as initialOrders } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(initialOrders);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "dispatched">("all");

  const filteredOrders = orders.filter((order) => {
    if (filter === "pending") {
      return !order.assignedStore;
    }
    if (filter === "dispatched") {
      return Boolean(order.assignedStore);
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
    <>
      <PageHeading
        eyebrow="Orders"
        title="Every customer purchase."
        body="Review, approve, and dispatch orders to the store for fulfilment."
      />

      {/* DISPATCH MESSAGE */}
      {dispatchMessage && (
        <div className="border-b hairline bg-[var(--paper-2)] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--sage-green)]/40 bg-[var(--sage-green)]/15 p-4 text-sm text-[var(--deep-green)]">
            <Check size={16} className="shrink-0" />
            {dispatchMessage}
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "All Orders"],
            ["pending", "Pending Dispatch"],
            ["dispatched", "Dispatched"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as typeof filter)}
              className={`focus-ring rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all ${
                filter === value
                  ? "bg-[var(--deep-green)] !text-soft-cream"
                  : "border hairline text-[var(--muted)] hover:border-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ORDERS LIST */}
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
            >
              {/* ORDER HEADER */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b hairline p-4 sm:p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-10 place-items-center rounded-full bg-[var(--paper-2)]">
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
                <div className="flex items-center gap-3">
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

                {/* ORDER TOTAL & ACTIONS */}
                <div className="flex flex-col items-start gap-3 border-t hairline pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <div className="text-right">
                    <p className="text-xs text-[var(--muted)]">Total</p>
                    <p className="text-lg font-semibold">{formatKes(order.total)}</p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="focus-ring group inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
                    >
                      <Eye size={12} />
                      View
                    </Link>

                    {!order.assignedStore ? (
                      <button
                        type="button"
                        onClick={() => handleDispatchOrder(order.id)}
                        className="focus-ring group inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3 hover:shadow-lg"
                      >
                        <Send size={12} />
                        Dispatch
                        <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                        <Check size={12} />
                        Dispatched to {order.assignedStore}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* DELIVERY INFO */}
              <div className="border-t hairline bg-[var(--paper-2)]/50 px-4 py-3 sm:px-5">
                <p className="text-xs text-[var(--muted)]">
                  Delivery to: {order.deliveryLocation}
                  {order.assignedStore ? ` · Assigned: ${order.assignedStore}` : ""}
                </p>
              </div>
            </article>
          ))}

          {filteredOrders.length === 0 && (
            <div className="rounded-lg border hairline bg-[var(--paper-2)] p-8 text-center">
              <p className="text-sm font-medium">No orders found</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                There are no orders matching the selected filter.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
