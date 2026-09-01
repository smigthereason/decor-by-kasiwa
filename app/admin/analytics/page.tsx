"use client";

import { useState } from "react";
import { BarChart3, Boxes, CircleDollarSign, ShoppingBag, Users } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import LiveDataState from "@/components/backoffice/LiveDataState";
import MetricCard from "@/components/backoffice/MetricCard";
import { useLiveOperations } from "@/lib/operations/client";
import { formatKes } from "@/lib/operations/selectors";

export default function AdminAnalyticsPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  const rangeStart = fromDate ? new Date(`${fromDate}T00:00:00.000+03:00`).getTime() : null;
  const rangeEnd = toDate ? new Date(`${toDate}T23:59:59.999+03:00`).getTime() : null;
  const paidOrders = data.orders.filter((order) => {
    if (order.paymentStatus !== "paid") return false;
    const timestamp = new Date(order.soldAt || order.createdAt).getTime();
    if (rangeStart !== null && timestamp < rangeStart) return false;
    if (rangeEnd !== null && timestamp > rangeEnd) return false;
    return true;
  });
  const businessRevenueFor = (order: (typeof paidOrders)[number]) => Math.max(0, order.subtotal - Number(order.discountAmount || 0));
  const revenue = paidOrders.reduce((sum, order) => sum + businessRevenueFor(order), 0);
  const deliveryPayables = paidOrders.reduce((sum, order) => sum + Number(order.deliveryFee || 0), 0);
  const moneyIn = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const avgOrder = paidOrders.length ? revenue / paidOrders.length : 0;
  const inventoryRetailValue = data.products.reduce((sum, product) => sum + product.retailPrice * product.onHand, 0);
  const productRevenue = new Map<string, number>();
  for (const order of paidOrders) {
    for (const line of order.lineItems) {
      productRevenue.set(line.name, (productRevenue.get(line.name) || 0) + line.unitPrice * line.quantity);
    }
  }
  const topProducts = [...productRevenue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const customerRevenue = new Map<string, { id: string; name: string; orders: number; lifetimeValue: number }>();
  for (const order of paidOrders) {
    const key = order.customerId || order.customerEmail || order.customerName;
    const current = customerRevenue.get(key) || { id: key, name: order.customerName || "Customer", orders: 0, lifetimeValue: 0 };
    current.orders += 1;
    current.lifetimeValue += businessRevenueFor(order);
    customerRevenue.set(key, current);
  }
  const topCustomers = [...customerRevenue.values()].sort((a,b) => b.lifetimeValue - a.lifetimeValue).slice(0,8);
  const activeCustomerCount = customerRevenue.size;
  const rangeLabel = fromDate || toDate ? `${fromDate || "Beginning"} to ${toDate || "Today"}` : "All dates";
  const exportRows = [
    { section: "Business totals", metric: "Business revenue", value: revenue, detail: `${paidOrders.length} paid orders; delivery excluded` },
    { section: "Business totals", metric: "Delivery payables", value: deliveryPayables, detail: "Pass-through delivery amounts" },
    { section: "Business totals", metric: "Money In", value: moneyIn, detail: "Business revenue + delivery payables" },
    { section: "Business totals", metric: "Average revenue / order", value: avgOrder, detail: "Delivery excluded" },
    { section: "Business totals", metric: "Purchasing customers", value: activeCustomerCount, detail: rangeLabel },
    { section: "Business totals", metric: "Inventory retail value", value: inventoryRetailValue, detail: "Retail price x stock" },
    ...topProducts.map(([name, value]) => ({ section: "Top products", metric: name, value, detail: "Paid order revenue" })),
    ...topCustomers.map((customer) => ({ section: "Customer value", metric: customer.name, value: customer.lifetimeValue, detail: `${customer.orders} orders` })),
  ];

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="kicker text-[var(--muted)]">Analytics</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live business analytics</h1><p className="mt-3 text-sm text-[var(--muted)]">Calculated only from live Sanity products, customers and orders.</p></div>
          <ExportButtons title={`Decor by Kasiwa Analytics - ${rangeLabel}`} columns={[{key:"section",label:"Section"},{key:"metric",label:"Metric"},{key:"value",label:"Value"},{key:"detail",label:"Detail"}]} rows={exportRows}/>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} max={toDate || undefined} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
          <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} min={fromDate || undefined} className="min-h-10 rounded-lg border hairline bg-[var(--paper)] px-3 text-xs font-normal normal-case text-[var(--ink)]" /></label>
          {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="min-h-10 rounded-full border hairline px-4 text-[9px] font-semibold uppercase tracking-[0.05em]">Clear dates</button>}
          <p className="w-full text-xs text-[var(--muted)] sm:w-auto sm:pl-2">Showing: {rangeLabel}</p>
        </div>
      </div>
      <section className="grid grid-cols-1 border-b hairline sm:grid-cols-2 xl:grid-cols-5"><MetricCard index="01" label="Business revenue" value={formatKes(revenue)} detail="Paid product revenue; delivery payables excluded." icon={CircleDollarSign} /><MetricCard index="02" label="Delivery payables" value={formatKes(deliveryPayables)} detail="Delivery money collected on behalf of fulfilment." icon={ShoppingBag} /><MetricCard index="03" label="Money In" value={formatKes(moneyIn)} detail="Total customer payments including delivery payables." icon={CircleDollarSign} /><MetricCard index="04" label="Purchasing customers" value={String(activeCustomerCount)} detail={`Customers with paid orders · ${rangeLabel}.`} icon={Users} /><MetricCard index="05" label="Inventory retail value" value={formatKes(inventoryRetailValue)} detail="Retail price multiplied by current on-hand stock." icon={Boxes} /></section>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2 lg:p-8"><section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><div className="flex items-center gap-3"><BarChart3 size={18} /><div><p className="kicker text-[var(--muted)]">Top products</p><p className="mt-1 text-xs text-[var(--muted)]">Based on paid order revenue.</p></div></div><div className="mt-5 divide-y hairline">{topProducts.length ? topProducts.map(([name, value], index) => <div key={name} className="flex items-center justify-between gap-4 py-3"><div className="flex items-center gap-3"><span className="text-[10px] text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span><span className="text-sm font-medium">{name}</span></div><span className="text-sm font-semibold">{formatKes(value)}</span></div>) : <p className="py-10 text-center text-sm text-[var(--muted)]">No paid order data yet.</p>}</div></section><section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><p className="kicker text-[var(--muted)]">Customer value</p><div className="mt-5 divide-y hairline">{topCustomers.map((customer) => <div key={customer.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{customer.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{customer.orders} orders</p></div><span className="text-sm font-semibold">{formatKes(customer.lifetimeValue)}</span></div>)}</div></section></div>
    </div>
  );
}
