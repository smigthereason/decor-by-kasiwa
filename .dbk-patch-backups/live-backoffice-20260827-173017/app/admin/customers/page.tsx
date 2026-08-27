"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Mail, Phone, MapPin, Eye, ShoppingBag } from "lucide-react";
import { customers } from "@/lib/operations/data";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

export default function AdminCustomersPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = customers.filter((customer) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.phone.toLowerCase().includes(term) ||
      customer.location.toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">User Accounts</p>
        <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Customer List
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          A concise customer view for contact details, location, purchase frequency and lifetime value.
        </p>
      </div>

      {/* SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search customers..."
            className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
          />
        </div>
      </div>

      {/* CUSTOMER CARDS */}
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCustomers.map((customer, index) => (
            <article
              key={customer.id}
              className="group flex flex-col rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-full bg-[var(--ink)] text-sm font-semibold text-white">
                    {customer.name.split(" ").map(word => word[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[10px] font-medium tracking-[0.08em] text-[var(--muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <span className="rounded-full bg-[var(--paper-2)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {customer.orders} {customer.orders === 1 ? "Order" : "Orders"}
                </span>
              </div>

              {/* Customer Info */}
              <h2 className="mt-4 text-base font-semibold tracking-[-0.02em] sm:text-lg">
                {customer.name}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <Mail size={12} className="shrink-0" />
                <span className="truncate">{customer.email}</span>
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <Phone size={12} className="shrink-0" />
                {customer.phone}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <MapPin size={12} className="shrink-0" />
                {customer.location}
              </p>

              {/* Stats */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-4">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    Lifetime Value
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatKes(customer.lifetimeValue)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    Last Order
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {formatDateTime(customer.lastOrderAt)}
                  </p>
                </div>
              </div>

              {/* View Button */}
              <Link
                href={`/admin/customers/${customer.id}`}
                className="group/link mt-4 inline-flex items-center justify-center gap-2 rounded-full border hairline py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-all hover:border-[var(--ink)] hover:text-[var(--ink)]"
              >
                <Eye size={12} />
                View Details
              </Link>
            </article>
          ))}

          {filteredCustomers.length === 0 && (
            <div className="col-span-full rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
              <p className="text-sm font-medium">No customers found</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Try adjusting your search term.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
