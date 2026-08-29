"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, Send, ShieldCheck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { OrderStatus, PaymentStatus } from "@/lib/operations/types";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";

type Mode = "admin" | "store";

const adminStatuses: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "ready_for_store",
  "picking",
  "packed",
  "cancelled",
];

const storeStatuses: OrderStatus[] = ["ready_for_store", "picking", "packed"];
const paymentStatuses: PaymentStatus[] = ["pending", "paid", "refunded", "failed"];

export default function ManagerOrderDetailPage({ mode }: { mode: Mode }) {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const order = data?.orders.find((item) => item.id === id);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const basePath = mode === "admin" ? "/admin/orders" : "/store/orders";

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  if (!order) {
    return (
      <div className="p-6">
        <Link href={basePath} className="underline">Back to orders</Link>
        <p className="mt-8 text-sm text-[var(--muted)]">Live order not found.</p>
      </div>
    );
  }

  const liveOrderId = order.id;
  const isPosSale = order.salesChannel === "POS";
  const dispatched = !isPosSale && (Boolean(order.dispatchedAt) || ["dispatched", "delivered"].includes(order.status));
  const canDispatch = !isPosSale && order.paymentStatus === "paid" && !dispatched && order.status !== "cancelled";
  const availableStatuses = mode === "admin" ? adminStatuses : storeStatuses;

  async function update(values: { status?: OrderStatus; paymentStatus?: PaymentStatus }) {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await mutateBackoffice(`/api/backoffice/orders/${encodeURIComponent(liveOrderId)}`, values);
      await refresh();
      setMessage("Order updated in Sanity.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function dispatchOrder() {
    if (saving || !canDispatch) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await mutateBackoffice(
        `/api/backoffice/orders/${encodeURIComponent(liveOrderId)}/dispatch`,
        {},
        "POST",
      );
      await refresh();
      setMessage(typeof result?.message === "string" ? result.message : "Order dispatched for delivery.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Dispatch failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <Link href={basePath} className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" /> Back to orders
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">{order.orderNumber}</p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">{order.customerName}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{formatDateTime(order.createdAt)} · {order.deliveryLocation}</p>
          </div>
          <div className="flex flex-wrap gap-2"><StatusPill value={order.status} /><StatusPill value={order.paymentStatus} /></div>
        </div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="text-lg font-medium">Items</h2>
          <div className="mt-4 divide-y hairline">
            {order.lineItems.map((line) => (
              <div key={line.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-semibold">{line.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{line.category}{line.finish ? ` · ${line.finish}` : ""}{line.size ? ` · ${line.size}` : ""} · Qty {line.quantity}</p>
                </div>
                <p className="text-sm font-semibold">{formatKes(line.unitPrice * line.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t hairline pt-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatKes(order.subtotal)}</span></div>
            <div className="mt-2 flex justify-between"><span>Delivery</span><span>{formatKes(order.deliveryFee)}</span></div>
            <div className="mt-3 flex justify-between text-base font-semibold"><span>Total</span><span>{formatKes(order.total)}</span></div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">Customer</p>
            <p className="mt-3 text-sm font-semibold">{order.customerName}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{order.customerEmail}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{order.customerPhone || "No phone supplied"}</p>
            <p className="mt-3 text-xs leading-5">{order.deliveryLocation}</p>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">Workflow</p>

            {isPosSale && (
              <div className="mt-4 rounded-lg border border-[var(--deep-green)]/15 bg-[var(--deep-green)]/[0.04] p-4">
                <p className="text-xs font-semibold text-[var(--deep-green)]">Physical POS sale</p>
                <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
                  Sold by {order.soldByName || "staff"}{order.soldByRole ? ` · ${order.soldByRole.replaceAll("_", " ")}` : ""}
                  {order.soldAt ? ` · ${formatDateTime(order.soldAt)}` : ""}.
                </p>
                <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
                  Payment channel: {order.paymentChannel === "cash" ? "Cash" : order.paymentChannel || "POS"}. This sale is fulfilled in-store and is not part of the delivery dispatch workflow.
                </p>
              </div>
            )}

            {!isPosSale && !dispatched && (
              <>
                <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Preparation status</label>
                <div className="relative mt-2 w-full">
                  <select
                    disabled={saving}
                    value={availableStatuses.includes(order.status) ? order.status : availableStatuses[0]}
                    onChange={(e) => void update({ status: e.target.value as OrderStatus })}
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm font-medium outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {availableStatuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                </div>
              </>
            )}

            {mode === "admin" && !isPosSale && !dispatched && (
              <>
                <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Payment status</label>
                <div className="relative mt-2 w-full">
                  <select
                    disabled={saving}
                    value={order.paymentStatus}
                    onChange={(e) => void update({ paymentStatus: e.target.value as PaymentStatus })}
                    className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm font-medium outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                </div>
              </>
            )}

            {!isPosSale && !dispatched ? (
              <button
                type="button"
                disabled={saving || !canDispatch}
                onClick={() => void dispatchOrder()}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send size={14} /> {saving ? "Working…" : "Dispatch for delivery"}
              </button>
            ) : !isPosSale ? (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
                <p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15} /> Dispatched once</p>
                <p className="mt-2 text-[10px] leading-5">
                  {order.dispatchedAt ? formatDateTime(order.dispatchedAt) : "Dispatch recorded"}{order.dispatchedByName ? ` · ${order.dispatchedByName}` : ""}
                </p>
                <p className="mt-2 text-[10px]">This action is locked so the same order cannot be dispatched twice.</p>
              </div>
            ) : null}

            {!isPosSale && !canDispatch && !dispatched && order.paymentStatus !== "paid" && (
              <p className="mt-3 flex items-center gap-2 text-[10px] text-[var(--muted)]"><Check size={12} /> Dispatch becomes available after payment is confirmed.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
