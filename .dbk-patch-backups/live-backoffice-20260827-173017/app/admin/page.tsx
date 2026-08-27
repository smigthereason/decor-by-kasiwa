"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageOpen,
  ShoppingBag,
  TrendingUp,
  Users,
  Clock,
} from "lucide-react";

import MetricCard from "@/components/backoffice/MetricCard";
import OrderTable from "@/components/backoffice/OrderTable";
import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { activity, orders, shipments } from "@/lib/operations/data";
import {
  adminMetrics,
  formatDateTime,
  formatKes,
} from "@/lib/operations/selectors";

export default function AdminDashboardPage() {
  const metrics = adminMetrics();

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* ============================================================ */}
      {/* PAGE HEADER                                                  */}
      {/* ============================================================ */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">The business, at a glance.</p>
        <h1 className="mt-2 text-3xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
          Business Overview
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Orders, revenue, stock and fulfilment in one operational view.
        </p>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href="/admin/orders"
            className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg sm:w-auto"
          >
            <span>Review orders</span>
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
          <Link
            href="/store"
            className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border hairline px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-all hover:border-[var(--ink)] hover:text-[var(--ink)] sm:w-auto"
          >
            <span>Store operations</span>
            <ArrowRight
              size={13}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </div>
      </div>

      {/* ============================================================ */}
      {/* METRICS GRID                                                 */}
      {/* ============================================================ */}
      <section className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:p-8 xl:grid-cols-4">
        {/* Revenue Card */}
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--ink)] text-[var(--paper)]">
              <CircleDollarSign size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
              01
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Paid Revenue
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {formatKes(metrics.revenue)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Total paid value in current order set
          </p>
        </article>

        {/* Open Orders Card */}
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <ShoppingBag size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
              02
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Open Orders
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.openOrders).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Moving through payment or delivery
          </p>
        </article>

        {/* Fulfilment Card */}
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <PackageOpen size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
              03
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Fulfilment Queue
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.fulfilmentQueue).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            Shipments requiring action
          </p>
        </article>

        {/* Stock Card */}
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <Boxes size={18} strokeWidth={1.5} />
            </span>
            <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
              04
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Stock Attention
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {String(metrics.lowStock).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            SKUs at or below reorder threshold
          </p>
        </article>
      </section>

      {/* ============================================================ */}
      {/* RECENT ORDERS & ACTIVITY                                     */}
      {/* ============================================================ */}
      <section className="grid grid-cols-1 gap-3 p-4 sm:gap-4 sm:p-6 lg:p-8 xl:grid-cols-[1.5fr_1fr]">
        {/* Recent Orders */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="kicker text-[var(--muted)]">Recent orders</p>
              <h2 className="mt-1 text-xl font-medium tracking-[-0.03em]">
                Latest purchases
              </h2>
            </div>
            <Link
              href="/admin/orders"
              className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              View all
              <ArrowRight
                size={13}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* Mobile order list */}
          <div className="space-y-3 sm:hidden">
            {orders.slice(0, 4).map((order) => (
              <article
                key={order.id}
                className="rounded-lg border hairline p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{order.orderNumber}</p>
                  <StatusPill value={order.status} />
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {order.customerName}
                </p>
                <div className="mt-2 flex items-center justify-between border-t hairline pt-2">
                  <span className="text-xs text-[var(--muted)]">
                    {formatKes(order.total)}
                  </span>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink)]"
                  >
                    View
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Desktop order table */}
          <div className="hidden sm:block">
            <OrderTable orders={orders.slice(0, 4)} compact />
          </div>
        </div>

        {/* Live Activity */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <p className="kicker text-[var(--muted)]">Live activity</p>
          <div className="mt-4 space-y-4">
            {activity.map((event) => (
              <article
                key={event.id}
                className="border-t hairline pt-4 first:border-t-0 first:pt-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div>
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      {event.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {formatDateTime(event.timestamp)}
                  </span>
                </div>
                <p className="mt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {event.actor}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* FULFILMENT HANDOFF                                           */}
      {/* ============================================================ */}
      <section className="mx-4 mb-4 rounded-xl bg-[var(--ink)] p-5 text-[var(--paper)] sm:mx-6 sm:p-6 lg:mx-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker text-white/50">Fulfilment handoff</p>
            <h2 className="mt-2 max-w-[600px] text-xl font-medium leading-[1.1] tracking-[-0.03em] sm:text-2xl lg:text-3xl">
              Admin approves the order. Store takes it from shelf to doorstep.
            </h2>
          </div>

          <div className="w-full lg:max-w-[400px]">
            {shipments.slice(0, 3).map((shipment) => (
              <div
                key={shipment.id}
                className="flex flex-col gap-2 border-t border-white/15 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {shipment.shipmentNumber} · {shipment.orderNumber}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {shipment.customerName}
                  </p>
                </div>
                <StatusPill value={shipment.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
