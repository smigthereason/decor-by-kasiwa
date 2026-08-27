"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, Users } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { formatKes } from "@/lib/operations/selectors";

export default function AdminCustomersPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const customers = data?.customers || [];
  const filtered = customers.filter((customer) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return [customer.name, customer.email, customer.phone, customer.location]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term));
  });

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Customers</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live customer directory</h1><p className="mt-3 text-sm text-[var(--muted)]">Google accounts and guest purchasers are stored in the same Sanity customer directory.</p></div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="relative max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or location..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div></div>
      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((customer) => <Link key={customer.id} href={`/admin/customers/${encodeURIComponent(customer.id)}`} className="rounded-xl border hairline bg-[var(--paper)] p-5 transition-shadow hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{customer.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{customer.email}</p><p className="mt-1 text-xs text-[var(--muted)]">{customer.phone || "—"}</p></div><StatusPill value={(customer.status || "ACTIVE").toLowerCase()} /></div><div className="mt-4 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><span>{customer.authenticated ? "Google" : "Guest checkout"}</span><span>·</span><span>{customer.role || "CUSTOMER"}</span></div><div className="mt-5 grid grid-cols-2 gap-3 border-t hairline pt-4"><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Orders</p><p className="mt-1 text-sm font-semibold">{customer.orders}</p></div><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Lifetime value</p><p className="mt-1 text-sm font-semibold">{formatKes(customer.lifetimeValue)}</p></div></div><p className="mt-4 text-xs text-[var(--muted)]">{customer.location}</p></Link>)}</div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Users size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live customers found</p></div>}
      </section>
    </div>
  );
}
