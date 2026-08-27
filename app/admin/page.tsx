"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import MetricCard from "@/components/backoffice/MetricCard";
import OrderTable from "@/components/backoffice/OrderTable";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminOverviewPage() {
  const { data, loading, error, refresh } = useLiveOperations();

  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <LiveDataState loading={loading} error={error} onRetry={refresh} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">Admin overview</p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.045em] sm:text-4xl lg:text-5xl">
              Live operations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Products, customers, orders, inventory and fulfilment are loaded directly from the live Sanity dataset.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/products" className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
              <Boxes size={13} /> Products
            </Link>
            <Link href="/admin/orders" className="inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">
              <ShoppingBag size={13} /> Orders
            </Link>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 border-b hairline sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard index="01" label="Paid revenue" value={formatKes(data.admin.revenue)} detail="Revenue from live paid orders." icon={CircleDollarSign} />
        <MetricCard index="02" label="Open orders" value={String(data.admin.openOrders)} detail="Orders not yet delivered or cancelled." icon={ClipboardList} />
        <MetricCard index="03" label="Fulfilment queue" value={String(data.admin.fulfilmentQueue)} detail="Live shipments still in progress." icon={Truck} />
        <MetricCard index="04" label="Low stock" value={String(data.admin.lowStock)} detail="Products at or below their live reorder threshold." icon={PackageCheck} />
      </section>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.6fr_1fr] lg:p-8">
        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="kicker text-[var(--muted)]">Recent orders</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Newest live commerce orders.</p>
            </div>
            <Link href="/admin/orders" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          {data.orders.length > 0 ? (
            <OrderTable orders={data.orders.slice(0, 5)} compact />
          ) : (
            <div className="rounded-lg border border-dashed hairline p-10 text-center text-sm text-[var(--muted)]">
              No live orders yet. Orders will appear here once checkout/payment creates them.
            </div>
          )}
        </section>

        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <p className="kicker text-[var(--muted)]">Live activity</p>
          <div className="mt-4 divide-y hairline">
            {data.activity.length > 0 ? data.activity.slice(0, 7).map((event) => (
              <div key={event.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold">{event.action}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{event.detail}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-[var(--muted)]">{formatDateTime(event.timestamp)}</span>
                </div>
              </div>
            )) : (
              <p className="py-8 text-center text-xs text-[var(--muted)]">No operational activity yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="px-4 pb-8 sm:px-6 lg:px-8">
        <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="kicker text-[var(--muted)]">Latest shipments</p>
            <Link href="/admin/shipments" className="text-[10px] font-semibold uppercase tracking-[0.08em]">View shipments</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {data.shipments.slice(0, 3).map((shipment) => (
              <article key={shipment.id} className="rounded-lg border hairline p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.shipmentNumber}</p>
                    <p className="mt-1 text-sm font-semibold">{shipment.customerName}</p>
                  </div>
                  <StatusPill value={shipment.status} />
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">{shipment.destination}</p>
              </article>
            ))}
            {data.shipments.length === 0 && (
              <div className="md:col-span-3 rounded-lg border border-dashed hairline p-8 text-center text-sm text-[var(--muted)]">No live shipments yet.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
