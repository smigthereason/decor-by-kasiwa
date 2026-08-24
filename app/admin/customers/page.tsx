import PageHeading from "@/components/backoffice/PageHeading";
import { customers } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminCustomersPage() {
  return (
    <>
      <PageHeading
        eyebrow="Customers"
        title="People behind the orders."
        body="A concise customer view for contact details, location, purchase frequency and lifetime value."
      />

      <section className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:p-8 xl:grid-cols-3">
        {customers.map((customer, index) => (
          <article 
            key={customer.id} 
            className="flex flex-col rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-6"
          >
            <div className="flex items-start justify-between">
              <span className="text-[10px] tracking-[0.08em] text-[var(--muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                {customer.orders} orders
              </span>
            </div>

            <h2 className="mt-6 text-xl font-medium leading-tight tracking-[-0.03em]">
              {customer.name}
            </h2>
            <p className="mt-2 text-xs text-[var(--muted)]">{customer.email}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{customer.phone}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{customer.location}</p>

            <div className="mt-auto grid grid-cols-2 border-t hairline pt-4 mt-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Lifetime value
                </p>
                <p className="mt-2 text-base font-semibold">
                  {formatKes(customer.lifetimeValue)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Last order
                </p>
                <p className="mt-2 text-xs">{formatDateTime(customer.lastOrderAt)}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
