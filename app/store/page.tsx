"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Boxes, ClipboardList, PackageCheck, SearchCheck, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import MetricCard from "@/components/backoffice/MetricCard";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { stockStatus } from "@/lib/operations/selectors";

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]"
    >
      {label}
      <ArrowUpRight size={13} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function StoreOverviewPage() {
  const { data, loading, error, refresh } = useLiveOperations();

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  const isSalesStaff = data.viewerRole === "STORE_STAFF";
  const pendingDeliveries = data.shipments.filter((shipment) => shipment.status === "dispatched").length;
  const openRestock = data.restockRequests.filter((request) => request.status !== "resolved").length;
  const unavailableProducts = data.products.filter((product) => stockStatus(product) !== "healthy").length;

  if (isSalesStaff) {
    return (
      <div className="min-h-full bg-[var(--paper-2)]">
        <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
          <p className="kicker text-[var(--muted)]">Sales staff</p>
          <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Sales & delivery workspace</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
            Check product availability, receive orders dispatched for delivery, confirm completed deliveries and alert management about stock issues.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <QuickLink href="/store/pos" label="Open POS" />
            <QuickLink href="/store/inventory" label="Check inventory" />
            <QuickLink href="/store/deliveries" label="Open deliveries" />
            <QuickLink href="/store/restock" label="Send restock alert" />
          </div>
        </div>

        <section className="grid grid-cols-1 border-b hairline sm:grid-cols-3">
          <MetricCard index="01" label="Ready deliveries" value={String(pendingDeliveries)} detail="Orders dispatched by Admin or Store Manager." icon={Truck} />
          <MetricCard index="02" label="Stock attention" value={String(unavailableProducts)} detail="Products low or unavailable in live inventory." icon={SearchCheck} />
          <MetricCard index="03" label="Open restock alerts" value={String(openRestock)} detail="Stock alerts still awaiting management resolution." icon={AlertTriangle} />
        </section>

        <section className="p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="kicker text-[var(--muted)]">Delivery queue</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Orders management has dispatched for customer delivery.</p>
              </div>
              <QuickLink href="/store/deliveries" label="View all" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {data.shipments.filter((shipment) => shipment.status === "dispatched").slice(0, 6).map((shipment) => (
                <article key={shipment.id} className="rounded-lg border hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.orderNumber}</p>
                      <p className="mt-1 text-sm font-semibold">{shipment.customerName}</p>
                    </div>
                    <StatusPill value={shipment.status} />
                  </div>
                  <p className="mt-3 text-xs text-[var(--muted)]">{shipment.destination}</p>
                </article>
              ))}
              {pendingDeliveries === 0 && (
                <div className="md:col-span-3 rounded-lg border border-dashed hairline p-10 text-center text-sm text-[var(--muted)]">No deliveries waiting right now.</div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  const newOrders = data.orders.filter(
    (order) => order.paymentStatus === "paid" && ["ready_for_store", "processing", "paid"].includes(order.status) && !order.dispatchedAt,
  ).length;

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Store operations</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live fulfilment workspace</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Review new paid orders, maintain the same product inventory as Admin, then dispatch approved orders to Sales Staff for delivery.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <QuickLink href="/store/pos" label="Open POS" />
          <QuickLink href="/store/orders" label="Open order queue" />
          <QuickLink href="/store/products" label="Manage products" />
          <QuickLink href="/store/dispatch" label="Dispatch orders" />
        </div>
      </div>
      <section className="grid grid-cols-1 border-b hairline sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard index="01" label="New orders" value={String(newOrders)} detail="Paid orders waiting for manager review." icon={ClipboardList} />
        <MetricCard index="02" label="Picking" value={String(data.store.beingPicked)} detail="Shipments currently being prepared." icon={Boxes} />
        <MetricCard index="03" label="Dispatched" value={String(pendingDeliveries)} detail="Orders currently with Sales Staff for delivery." icon={PackageCheck} />
        <MetricCard index="04" label="Restock alerts" value={String(openRestock)} detail="Sales Staff stock alerts requiring review." icon={AlertTriangle} />
      </section>
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between"><p className="kicker text-[var(--muted)]">Current fulfilment snapshot</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            {data.shipments.filter((shipment) => shipment.status !== "delivered").slice(0, 6).map((shipment) => (
              <article key={shipment.id} className="rounded-lg border hairline p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{shipment.shipmentNumber}</p><p className="mt-1 text-sm font-semibold">{shipment.customerName}</p></div>
                  <StatusPill value={shipment.status} />
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">{shipment.destination}</p>
              </article>
            ))}
            {data.shipments.length === 0 && <div className="md:col-span-3 rounded-lg border border-dashed hairline p-10 text-center text-sm text-[var(--muted)]">No live shipments yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
