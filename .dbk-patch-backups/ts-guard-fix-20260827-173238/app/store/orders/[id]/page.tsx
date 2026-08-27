"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { OrderStatus } from "@/lib/operations/types";
import { formatKes } from "@/lib/operations/selectors";

const storeStatuses: OrderStatus[] = ["ready_for_store", "picking", "packed", "dispatched", "delivered"];

export default function StoreOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const order = data?.orders.find((item) => item.id === id);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  if (!order || !storeStatuses.includes(order.status)) return <div className="p-6"><Link href="/store/orders" className="underline">Back to store orders</Link><p className="mt-8 text-sm text-[var(--muted)]">This order is not currently in the store fulfilment workflow.</p></div>;

  async function updateStatus(status: OrderStatus) {
    setSaving(true); setMessage(null);
    try { await mutateBackoffice(`/api/backoffice/orders/${encodeURIComponent(order.id)}`, { status }); await refresh(); setMessage("Order and shipment workflow updated in Sanity."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Update failed."); }
    finally { setSaving(false); }
  }

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><Link href="/store/orders" className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><ArrowLeft size={13} /> Back to orders</Link><div className="mt-4 flex items-start justify-between gap-4"><div><p className="kicker text-[var(--muted)]">{order.orderNumber}</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">{order.customerName}</h1><p className="mt-2 text-sm text-[var(--muted)]">{order.deliveryLocation}</p></div><StatusPill value={order.status} /></div>{message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}</div><div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8"><section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6"><h2 className="text-lg font-medium">Pick list</h2><div className="mt-4 divide-y hairline">{order.lineItems.map((line) => { const product = data.products.find((item) => item.productId === line.productId); return <div key={line.id} className="flex items-start justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{line.name}</p><p className="mt-1 text-xs text-[var(--muted)]">Qty {line.quantity} · {line.category}</p><p className="mt-1 text-[10px] text-[var(--muted)]">Live stock: {product ? product.onHand : "Product not found"}</p></div><p className="text-sm font-semibold">{formatKes(line.quantity * line.unitPrice)}</p></div>; })}</div></section><aside className="rounded-xl border hairline bg-[var(--paper)] p-5"><p className="kicker text-[var(--muted)]">Fulfilment status</p><select disabled={saving} value={order.status} onChange={(e) => void updateStatus(e.target.value as OrderStatus)} className="mt-4 w-full rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm">{storeStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select><p className="mt-4 text-xs leading-6 text-[var(--muted)]">Changes are persisted to Sanity and synchronised with the related shipment.</p></aside></div></div>;
}
