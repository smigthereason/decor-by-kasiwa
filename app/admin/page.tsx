import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackageOpen,
  ShoppingBag,
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
    <>
      <PageHeading
        eyebrow="Business Overview"
        title="The business, at a glance."
        body="Orders, revenue, stock and fulfilment in one operational view. Customer purchases flow from here into the store fulfilment queue."
        actions={
          <>
            <Link
              href="/admin/orders"
              className="group inline-flex min-h-12 items-center gap-3 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-4 hover:shadow-lg"
            >
              <span>Review orders</span>
              <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/store"
              className="inline-flex min-h-12 items-center gap-3 rounded-full border hairline px-6 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
            >
              Open store operations <ArrowRight size={14} />
            </Link>
          </>
        }
      />

      {/* METRICS CARDS */}
      <section className="grid border-b hairline sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index="01"
          label="Paid revenue"
          value={formatKes(metrics.revenue)}
          detail="Total paid value represented in the current operational order set."
          icon={CircleDollarSign}
        />
        <MetricCard
          index="02"
          label="Open orders"
          value={String(metrics.openOrders).padStart(2, "0")}
          detail="Orders still moving through payment, preparation or delivery."
          icon={ShoppingBag}
        />
        <MetricCard
          index="03"
          label="Fulfilment queue"
          value={String(metrics.fulfilmentQueue).padStart(2, "0")}
          detail="Shipments currently requiring store or delivery action."
          icon={PackageOpen}
        />
        <MetricCard
          index="04"
          label="Stock attention"
          value={String(metrics.lowStock).padStart(2, "0")}
          detail="SKUs at or below their reorder threshold."
          icon={Boxes}
        />
      </section>

      {/* RECENT ORDERS & ACTIVITY */}
      <section className="grid border-b hairline xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="bg-[var(--paper)] p-4 sm:p-6 lg:p-8 xl:border-r hairline">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="kicker text-[var(--muted)]">Recent orders</p>
              <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">
                Latest customer purchases.
              </h2>
            </div>

            <Link
              href="/admin/orders"
              className="focus-ring group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              View all
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <OrderTable orders={orders.slice(0, 4)} compact />
        </div>

        <div className="bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
          <p className="kicker text-[var(--muted)]">Live activity</p>

          <div className="mt-5">
            {activity.map((event) => (
              <article
                key={event.id}
                className="border-t hairline py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{event.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {formatDateTime(event.timestamp)}
                  </span>
                </div>
                <p className="mt-3 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {event.actor}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FULFILMENT HANDOFF */}
      <section className="bg-[var(--deep-green)] px-4 py-8 text-[var(--paper)] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker text-soft-cream/50">Fulfilment handoff</p>
            <h2 className="mt-3 max-w-[650px] text-3xl font-medium leading-[0.98] tracking-[-0.05em]">
              Admin approves the order. Store takes it from shelf to doorstep.
            </h2>
          </div>

          <div className="w-full max-w-[430px]">
            {shipments.slice(0, 3).map((shipment) => (
              <div
                key={shipment.id}
                className="flex items-center justify-between border-t border-soft-cream/15 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {shipment.shipmentNumber} · {shipment.orderNumber}
                  </p>
                  <p className="mt-1 text-xs text-soft-cream/50">
                    {shipment.customerName}
                  </p>
                </div>
                <StatusPill value={shipment.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
