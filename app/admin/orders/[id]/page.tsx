"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, MapPin, Phone, Check, Send, Package } from "lucide-react";
import { notFound } from "next/navigation";

import StatusPill from "@/components/backoffice/StatusPill";
import { orders as initialOrders } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [orders, setOrders] = useState(initialOrders);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);

  const order = orders.find((item) => item.id === orderId);

  if (!order) notFound();

  function handleDispatchOrder() {
    setOrders((current) =>
      current.map((item) =>
        item.id === orderId
          ? {
              ...item,
              status: "ready_for_store",
              assignedStore: "Kasiwa Main Store",
            }
          : item
      )
    );
    setDispatchMessage("Order dispatched to Main Store for fulfilment.");
    setTimeout(() => setDispatchMessage(null), 5000);
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin/orders"
              className="group mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
              Back to orders
            </Link>
            <p className="kicker text-[var(--muted)]">Order {order.orderNumber}</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.03em] sm:text-3xl lg:text-4xl">
              {order.customerName}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Placed {formatDateTime(order.createdAt)}
            </p>
          </div>
          <StatusPill value={order.status} />
        </div>
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

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
        {/* ORDER CONTENTS */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="text-lg font-medium tracking-[-0.02em]">Order Contents</h2>

          <div className="mt-4 space-y-4">
            {order.lineItems.map((line, index) => (
              <article key={line.id} className="flex items-start justify-between gap-4 border-b hairline pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[10px] font-medium text-[var(--muted)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{line.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {line.category}
                      {line.finish ? ` · ${line.finish}` : ""} · Qty {line.quantity}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold">
                  {formatKes(line.unitPrice * line.quantity)}
                </p>
              </article>
            ))}
          </div>

          {/* TOTALS */}
          <div className="mt-6 border-t hairline pt-4">
            <div className="flex justify-between py-2 text-sm">
              <span className="text-[var(--muted)]">Subtotal</span>
              <span>{formatKes(order.subtotal)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm">
              <span className="text-[var(--muted)]">Delivery</span>
              <span>{formatKes(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t hairline py-3">
              <span className="text-sm font-semibold uppercase tracking-[0.08em]">Total</span>
              <span className="text-xl font-semibold tracking-[-0.03em]">
                {formatKes(order.total)}
              </span>
            </div>
          </div>
        </div>

        {/* CUSTOMER & DISPATCH */}
        <div className="space-y-4">
          {/* Customer Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Customer</p>
            <h2 className="mt-2 text-xl font-medium tracking-[-0.02em]">
              {order.customerName}
            </h2>

            <div className="mt-4 space-y-3">
              <p className="flex items-center gap-3 text-sm">
                <Mail size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {order.customerEmail}
              </p>
              <p className="flex items-center gap-3 text-sm">
                <Phone size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {order.customerPhone}
              </p>
              <p className="flex items-center gap-3 text-sm">
                <MapPin size={15} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
                {order.deliveryLocation}
              </p>
            </div>
          </div>

          {/* Payment Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Payment</p>
            <div className="mt-3">
              <StatusPill value={order.paymentStatus} />
            </div>
          </div>

          {/* Fulfilment Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Fulfilment</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {order.assignedStore
                ? `Assigned to ${order.assignedStore}.`
                : "This order has not yet been handed to store operations."}
            </p>

            {!order.assignedStore ? (
              <button
                type="button"
                onClick={handleDispatchOrder}
                className="group mt-4 flex min-h-12 w-full items-center justify-between rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:shadow-lg"
              >
                <span>Dispatch to Store</span>
                <Send size={14} className="transition-transform group-hover:translate-x-1" />
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-green-600" />
                  <p className="text-sm font-medium text-green-800">
                    Dispatched to {order.assignedStore}
                  </p>
                </div>
              </div>
            )}

            <Link
              href="/admin/shipments"
              className="group mt-3 flex min-h-12 items-center justify-between rounded-full border hairline px-5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
            >
              View Shipments
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
