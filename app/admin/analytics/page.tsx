import PageHeading from "@/components/backoffice/PageHeading";
import { customers, inventory, orders } from "@/lib/operations/data";
import { formatKes } from "@/lib/operations/selectors";

const categoryRevenue = ["Furniture", "Lighting", "Textiles", "Décor"].map((category) => {
  const value = orders.flatMap((order) => order.lineItems)
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  return { category, value };
});

export default function AdminAnalyticsPage() {
  const maxCategory = Math.max(...categoryRevenue.map((item) => item.value), 1);
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const avgOrder = totalRevenue / Math.max(orders.length, 1);
  const inventoryRetailValue = inventory.reduce(
    (sum, item) => sum + item.onHand * item.retailPrice,
    0
  );

  return (
    <>
      <PageHeading
        eyebrow="Analytics"
        title="Signals worth acting on."
        body="A lightweight commercial view of revenue, order value, product mix and customer value without introducing a separate charting dependency."
      />

      {/* KEY METRICS */}
      <section className="grid gap-4 p-4 sm:grid-cols-3 sm:p-6 lg:p-8">
        {[
          ["Gross order value", formatKes(totalRevenue)],
          ["Average order value", formatKes(avgOrder)],
          ["Retail stock value", formatKes(inventoryRetailValue)],
        ].map(([label, value]) => (
          <article 
            key={label} 
            className="rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {label}
            </p>
            <p className="mt-4 text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{value}</p>
          </article>
        ))}
      </section>

      {/* REVENUE BY CATEGORY & TOP CUSTOMERS */}
      <section className="grid border-b hairline lg:grid-cols-2">
        <div className="bg-[var(--paper)] p-4 sm:p-6 lg:border-r hairline lg:p-8">
          <p className="kicker text-[var(--muted)]">Revenue by collection</p>

          <div className="mt-6 space-y-6">
            {categoryRevenue.map((item) => (
              <div key={item.category}>
                <div className="flex justify-between text-sm">
                  <span>{item.category}</span>
                  <span className="font-semibold">{formatKes(item.value)}</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-[var(--deep-green)]/10">
                  <div
                    className="h-1 rounded-full bg-[var(--deep-green)]"
                    style={{ width: `${Math.max((item.value / maxCategory) * 100, 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--deep-green)] p-4 text-[var(--paper)] sm:p-6 lg:p-8">
          <p className="kicker text-soft-cream/50">Highest-value customers</p>

          <div className="mt-6">
            {[...customers]
              .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
              .slice(0, 5)
              .map((customer, index) => (
                <div
                  key={customer.id}
                  className="grid grid-cols-[30px_1fr_auto] gap-3 border-t border-soft-cream/15 py-4"
                >
                  <span className="text-[10px] text-soft-cream/35">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    <p className="mt-1 text-xs text-soft-cream/50">
                      {customer.orders} orders · {customer.location}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatKes(customer.lifetimeValue)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}
