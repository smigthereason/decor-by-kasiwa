"use client";

import { BarChart3, Boxes, CircleDollarSign, ShoppingBag, Users } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import MetricCard from "@/components/backoffice/MetricCard";
import { useLiveOperations } from "@/lib/operations/client";
import { formatKes } from "@/lib/operations/selectors";

export default function AdminAnalyticsPage() {
  const { data, loading, error, refresh } = useLiveOperations();

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  const paidOrders = data.orders.filter((order) => order.paymentStatus === "paid");
  const revenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const avgOrder = paidOrders.length ? revenue / paidOrders.length : 0;
  const inventoryRetailValue = data.products.reduce((sum, product) => sum + product.retailPrice * product.onHand, 0);
  const productRevenue = new Map<string, number>();
  for (const order of paidOrders) {
    for (const line of order.lineItems) {
      productRevenue.set(line.name, (productRevenue.get(line.name) || 0) + line.unitPrice * line.quantity);
    }
  }
  const topProducts = [...productRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Analytics</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live business analytics</h1><p className="mt-3 text-sm text-[var(--muted)]">Calculated only from live Sanity products, customers and orders.</p></div>
      <section className="grid grid-cols-1 border-b hairline sm:grid-cols-2 xl:grid-cols-4"><MetricCard index="01" label="Paid revenue" value={formatKes(revenue)} detail="Revenue from paid live orders." icon={CircleDollarSign} /><MetricCard index="02" label="Average order" value={formatKes(avgOrder)} detail="Average value of paid live orders." icon={ShoppingBag} /><MetricCard index="03" label="Customers" value={String(data.customers.length)} detail="Google-authenticated customer records in Sanity." icon={Users} /><MetricCard index="04" label="Inventory retail value" value={formatKes(inventoryRetailValue)} detail="Retail price multiplied by current on-hand stock." icon={Boxes} /></section>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2 lg:p-8"><section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><div className="flex items-center gap-3"><BarChart3 size={18} /><div><p className="kicker text-[var(--muted)]">Top products</p><p className="mt-1 text-xs text-[var(--muted)]">Based on paid order revenue.</p></div></div><div className="mt-5 divide-y hairline">{topProducts.length ? topProducts.map(([name, value], index) => <div key={name} className="flex items-center justify-between gap-4 py-3"><div className="flex items-center gap-3"><span className="text-[10px] text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span><span className="text-sm font-medium">{name}</span></div><span className="text-sm font-semibold">{formatKes(value)}</span></div>) : <p className="py-10 text-center text-sm text-[var(--muted)]">No paid order data yet.</p>}</div></section><section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><p className="kicker text-[var(--muted)]">Customer value</p><div className="mt-5 divide-y hairline">{[...data.customers].sort((a,b) => b.lifetimeValue - a.lifetimeValue).slice(0,8).map((customer) => <div key={customer.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{customer.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{customer.orders} orders</p></div><span className="text-sm font-semibold">{formatKes(customer.lifetimeValue)}</span></div>)}</div></section></div>
    </div>
  );
}
