"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { OrderStatus, PaymentStatus } from "@/lib/operations/types";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

const orderStatuses: OrderStatus[] = ["pending","paid","processing","ready_for_store","picking","packed","dispatched","delivered","cancelled"];
const paymentStatuses: PaymentStatus[] = ["pending","paid","refunded","failed"];

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const order = data?.orders.find((item) => item.id === id);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  if (!order) return <div className="p-6"><Link href="/admin/orders" className="underline">Back to orders</Link><p className="mt-8 text-sm text-[var(--muted)]">Live order not found.</p></div>;

  const liveOrderId = order.id;

  async function update(values: { status?: OrderStatus; paymentStatus?: PaymentStatus }) {
    setSaving(true); setMessage(null);
    try { await mutateBackoffice(`/api/backoffice/orders/${encodeURIComponent(liveOrderId)}`, values); await refresh(); setMessage("Order updated in Sanity."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Update failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <Link href="/admin/orders" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><ArrowLeft size={13} /> Back to orders</Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="kicker text-[var(--muted)]">{order.orderNumber}</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">{order.customerName}</h1><p className="mt-2 text-sm text-[var(--muted)]">{formatDateTime(order.createdAt)} · {order.deliveryLocation}</p></div><div className="flex gap-2"><StatusPill value={order.status} /><StatusPill value={order.paymentStatus} /></div></div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><h2 className="text-lg font-medium">Items</h2><div className="mt-4 divide-y hairline">{order.lineItems.map((line) => <div key={line.id} className="flex items-start justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{line.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{line.category}{line.finish ? ` · ${line.finish}` : ""} · Qty {line.quantity}</p></div><p className="text-sm font-semibold">{formatKes(line.unitPrice * line.quantity)}</p></div>)}</div><div className="mt-5 border-t hairline pt-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatKes(order.subtotal)}</span></div><div className="mt-2 flex justify-between"><span>Delivery</span><span>{formatKes(order.deliveryFee)}</span></div><div className="mt-3 flex justify-between text-base font-semibold"><span>Total</span><span>{formatKes(order.total)}</span></div></div></section>
        <aside className="space-y-4"><section className="rounded-xl border hairline bg-[var(--paper)] p-5"><p className="kicker text-[var(--muted)]">Customer</p><p className="mt-3 text-sm font-semibold">{order.customerName}</p><p className="mt-1 text-xs text-[var(--muted)]">{order.customerEmail}</p><p className="mt-1 text-xs text-[var(--muted)]">{order.customerPhone || "No phone supplied"}</p></section><section className="rounded-xl border hairline bg-[var(--paper)] p-5"><p className="kicker text-[var(--muted)]">Live status</p><label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Order status</label><select disabled={saving} value={order.status} onChange={(e) => void update({ status: e.target.value as OrderStatus })} className="mt-2 w-full rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm">{orderStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select><label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Payment status</label><select disabled={saving} value={order.paymentStatus} onChange={(e) => void update({ paymentStatus: e.target.value as PaymentStatus })} className="mt-2 w-full rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm">{paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select><p className="mt-4 flex items-center gap-2 text-[10px] text-[var(--muted)]"><Check size={12} /> Setting Ready for Store creates/updates the live shipment.</p></section></aside>
      </div>
    </div>
  );
}
