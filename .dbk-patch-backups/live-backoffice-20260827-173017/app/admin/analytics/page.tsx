"use client";

import { useState } from "react";
import { TrendingUp, ShoppingBag, Boxes, ArrowRight } from "lucide-react";
import { customers, inventory, orders } from "@/lib/operations/data";
import { formatKes } from "@/lib/operations/selectors";

const categoryRevenue = ["Furniture", "Lighting", "Textiles", "Décor"].map((category) => {
  const value = orders.flatMap((order) => order.lineItems)
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return { category, value };
});

export default function AdminAnalyticsPage() {
  const [timeframe, setTimeframe] = useState<"all" | "month" | "week">("all");

  const maxCategory = Math.max(...categoryRevenue.map((item) => item.value), 1);
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const avgOrder = totalRevenue / Math.max(orders.length, 1);
  const inventoryRetailValue = inventory.reduce(
    (sum, item) => sum + item.onHand * item.retailPrice,
    0
  );

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">Business Metrics</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
              Analytics
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              A lightweight commercial view of revenue, order value, product mix and customer value.
            </p>
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-2">
            {[
              ["all", "All Time"],
              ["month", "This Month"],
              ["week", "This Week"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTimeframe(value as typeof timeframe)}
                className={`rounded-full px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all sm:px-4 sm:text-[10px] ${
                  timeframe === value
                    ? "bg-[var(--ink)] !text-white"
                    : "border hairline text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KEY METRICS */}
      <section className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-3 lg:p-8">
        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-6">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--ink)] text-white">
              <TrendingUp size={18} strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Gross Order Value
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {formatKes(totalRevenue)}
          </p>
        </article>

        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-6">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <ShoppingBag size={18} strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Average Order Value
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {formatKes(avgOrder)}
          </p>
        </article>

        <article className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-6">
          <div className="flex items-start justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-[var(--paper-2)] text-[var(--ink)]">
              <Boxes size={18} strokeWidth={1.5} />
            </span>
          </div>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            Retail Stock Value
          </p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">
            {formatKes(inventoryRetailValue)}
          </p>
        </article>
      </section>

      {/* REVENUE BY CATEGORY & TOP CUSTOMERS */}
      <section className="grid grid-cols-1 gap-3 p-4 pt-0 sm:p-6 sm:pt-0 lg:grid-cols-2 lg:p-8 lg:pt-0">
        {/* Revenue by Category */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <p className="kicker text-[var(--muted)]">Revenue by Collection</p>

          <div className="mt-6 space-y-5">
            {categoryRevenue.map((item) => (
              <div key={item.category}>
                <div className="flex justify-between text-sm">
                  <span>{item.category}</span>
                  <span className="font-semibold">{formatKes(item.value)}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[var(--ink)]/10">
                  <div
                    className="h-1.5 rounded-full bg-[var(--ink)] transition-all duration-500"
                    style={{ width: `${Math.max((item.value / maxCategory) * 100, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Additional Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t hairline pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Total Orders
              </p>
              <p className="mt-1 text-lg font-semibold">{orders.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                Total Customers
              </p>
              <p className="mt-1 text-lg font-semibold">{customers.length}</p>
            </div>
          </div>
        </div>

        {/* Top Customers */}
        <div className="rounded-xl bg-[var(--ink)] p-5 text-[var(--paper)] sm:p-6">
          <p className="kicker text-white/50">Highest-value Customers</p>

          <div className="mt-5">
            {[...customers]
              .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
              .slice(0, 5)
              .map((customer, index) => (
                <div
                  key={customer.id}
                  className="grid grid-cols-[30px_1fr_auto] gap-3 border-t border-white/15 py-3.5"
                >
                  <span className="text-[10px] text-white/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    <p className="mt-0.5 text-xs text-white/50">
                      {customer.orders} orders · {customer.location}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatKes(customer.lifetimeValue)}
                  </span>
                </div>
              ))}
          </div>

          {/* View all customers link */}
          <div className="mt-4 border-t border-white/15 pt-4">
            <a
              href="/admin/customers"
              className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60 transition-colors hover:text-white"
            >
              View all customers
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
