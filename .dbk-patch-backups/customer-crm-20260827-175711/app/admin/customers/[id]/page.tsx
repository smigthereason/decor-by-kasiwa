"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import OrderTable from "@/components/backoffice/OrderTable";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { formatKes } from "@/lib/operations/selectors";

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const customer = data?.customers.find((item) => item.id === id);

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  if (!customer) return <div className="p-6"><Link href="/admin/customers" className="underline">Back to customers</Link><p className="mt-8 text-sm text-[var(--muted)]">Live customer not found.</p></div>;

  const customerOrders = data.orders.filter((order) => order.customerEmail.toLowerCase() === customer.email.toLowerCase());

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><Link href="/admin/customers" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><ArrowLeft size={13} /> Back to customers</Link><div className="mt-4 flex items-start justify-between gap-4"><div><h1 className="text-3xl font-medium tracking-[-0.04em]">{customer.name}</h1><p className="mt-2 text-sm text-[var(--muted)]">{customer.email}</p></div><div className="flex gap-2"><StatusPill value={(customer.status || "ACTIVE").toLowerCase()} /><StatusPill value={(customer.role || "CUSTOMER").toLowerCase()} /></div></div></div>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.8fr_1.5fr] lg:p-8">
        <aside className="space-y-4"><section className="rounded-xl border hairline bg-[var(--paper)] p-5"><p className="kicker text-[var(--muted)]">Contact</p><div className="mt-4 space-y-3 text-sm"><p className="flex items-center gap-3"><Mail size={15} className="text-[var(--muted)]" />{customer.email}</p><p className="flex items-center gap-3"><Phone size={15} className="text-[var(--muted)]" />{customer.phone}</p><p className="flex items-center gap-3"><MapPin size={15} className="text-[var(--muted)]" />{customer.location}</p></div></section><section className="rounded-xl border hairline bg-[var(--paper)] p-5"><p className="kicker text-[var(--muted)]">Commerce</p><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Orders</p><p className="mt-1 text-xl font-semibold">{customer.orders}</p></div><div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Value</p><p className="mt-1 text-xl font-semibold">{formatKes(customer.lifetimeValue)}</p></div></div></section></aside>
        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><p className="kicker text-[var(--muted)]">Order history</p><div className="mt-4">{customerOrders.length ? <OrderTable orders={customerOrders} compact /> : <div className="rounded-lg border border-dashed hairline p-10 text-center text-sm text-[var(--muted)]">No live orders for this customer.</div>}</div></section>
      </div>
    </div>
  );
}
