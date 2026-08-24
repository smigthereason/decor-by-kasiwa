"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail, MapPin, Phone, Check, Send, Package } from "lucide-react";
import { notFound } from "next/navigation";

import PageHeading from "@/components/backoffice/PageHeading";
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
    <>
      <PageHeading
        eyebrow={`Order ${order.orderNumber}`}
        title={order.customerName}
        body={`Placed ${formatDateTime(order.createdAt)} · ${order.deliveryLocation}`}
        actions={
          <Link
            href="/admin/orders"
            className="focus-ring group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" /> 
            Back to orders
          </Link>
        }
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

      <section className="grid border-b hairline lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
        {/* ORDER CONTENTS */}
        <div className="bg-[var(--paper)] p-4 sm:p-6 lg:p-8 lg:border-r hairline">
          <div className="flex items-center justify-between border-b hairline pb-4">
            <h2 className="text-xl font-medium tracking-[-0.03em]">Order contents</h2>
            <StatusPill value={order.status} />
          </div>

          {order.lineItems.map((line, index) => (
            <article
              key={line.id}
              className="grid grid-cols-[42px_minmax(0,1fr)_auto] gap-4 border-b hairline py-5"
            >
              <span className="text-[10px] tracking-[0.08em] text-[var(--muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-medium">{line.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {line.category}
                  {line.finish ? ` · ${line.finish}` : ""} · Qty {line.quantity}
                </p>
              </div>
              <p className="text-sm font-semibold">
                {formatKes(line.unitPrice * line.quantity)}
              </p>
            </article>
          ))}

          <div className="ml-auto mt-6 max-w-[330px]">
            <div className="flex justify-between border-t hairline py-3 text-sm">
              <span className="text-[var(--muted)]">Subtotal</span>
              <span>{formatKes(order.subtotal)}</span>
            </div>
            <div className="flex justify-between border-t hairline py-3 text-sm">
              <span className="text-[var(--muted)]">Delivery</span>
              <span>{formatKes(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--ink)]/20 py-4">
              <span className="text-xs font-semibold uppercase tracking-[0.08em]">
                Total
              </span>
              <span className="text-xl font-medium tracking-[-0.03em]">
                {formatKes(order.total)}
              </span>
            </div>
          </div>
        </div>

        {/* CUSTOMER DETAILS & DISPATCH */}
        <aside className="bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
          <p className="kicker text-[var(--muted)]">Customer</p>

          <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">
            {order.customerName}
          </h2>

          <div className="mt-6 space-y-4 border-t hairline pt-5">
            <p className="flex gap-3 text-sm">
              <Mail size={16} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
              {order.customerEmail}
            </p>
            <p className="flex gap-3 text-sm">
              <Phone size={16} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
              {order.customerPhone}
            </p>
            <p className="flex gap-3 text-sm">
              <MapPin size={16} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
              {order.deliveryLocation}
            </p>
          </div>

          <div className="mt-8 border-t hairline pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              Payment
            </p>
            <div className="mt-3">
              <StatusPill value={order.paymentStatus} />
            </div>
          </div>

          <div className="mt-8 border-t hairline pt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              Fulfilment
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {order.assignedStore
                ? `Assigned to ${order.assignedStore}.`
                : "This order has not yet been handed to store operations."}
            </p>

            {/* DISPATCH BUTTON */}
            {!order.assignedStore ? (
              <button
                type="button"
                onClick={handleDispatchOrder}
                className="focus-ring group mt-5 flex min-h-12 w-full items-center justify-between rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg"
              >
                <span>Dispatch to Store</span>
                <Send size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
              </button>
            ) : (
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-[var(--deep-green)]" />
                  <p className="text-sm font-medium text-[var(--deep-green)]">
                    Dispatched to {order.assignedStore}
                  </p>
                </div>
              </div>
            )}

            <Link
              href="/admin/shipments"
              className="focus-ring group mt-3 flex min-h-12 items-center justify-between rounded-full border hairline px-6 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
            >
              View Shipments
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </aside>
      </section>
    </>
  );
}
