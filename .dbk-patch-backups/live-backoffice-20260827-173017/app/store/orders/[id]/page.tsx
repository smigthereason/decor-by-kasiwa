"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Package, Check, Send, Boxes } from "lucide-react";

import StatusPill from "@/components/backoffice/StatusPill";
import { inventory, orders } from "@/lib/operations/data";
import {
  availableStock,
  formatKes,
} from "@/lib/operations/selectors";

export default function StoreOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [ordersList, setOrdersList] = useState(orders);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);

  const order = ordersList.find((item) => item.id === orderId && item.assignedStore);

  if (!order) notFound();

  function handlePickingComplete() {
    setOrdersList((current) =>
      current.map((item) =>
        item.id === orderId
          ? { ...item, status: "packed" }
          : item
      )
    );
    setCompleteMessage("Picking complete. Shipment moved to packing.");
    setTimeout(() => setCompleteMessage(null), 5000);
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/store/orders"
              className="group mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
              Back to queue
            </Link>
            <p className="kicker text-[var(--muted)]">Pick List · {order.orderNumber}</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.03em] sm:text-3xl lg:text-4xl">
              {order.customerName}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {order.deliveryLocation}
            </p>
          </div>
          <StatusPill value={order.status} />
        </div>
      </div>

      {/* COMPLETE MESSAGE */}
      {completeMessage && (
        <div className="border-b hairline bg-[var(--paper)] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <Check size={16} className="shrink-0" />
            {completeMessage}
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1.5fr_1fr] lg:p-8">
        {/* PICK REQUIREMENTS */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <div className="flex items-center justify-between border-b hairline pb-4">
            <h2 className="text-lg font-medium tracking-[-0.02em]">Pick Requirements</h2>
            <StatusPill value={order.status} />
          </div>

          <div className="mt-4 space-y-4">
            {order.lineItems.map((line, index) => {
              const stock = inventory.find(
                (item) =>
                  item.productId === line.productId ||
                  item.name === line.name
              );

              return (
                <article
                  key={line.id}
                  className="flex flex-col gap-3 rounded-lg border hairline p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--paper-2)] text-[10px] font-medium text-[var(--muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{line.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {line.finish ?? "Standard"} · {formatKes(line.unitPrice)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        Location
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {stock?.location ?? "TBC"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                        Pick
                      </p>
                      <p className="mt-1 text-lg font-semibold">{line.quantity}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {/* DELIVERY & ACTION */}
        <div className="space-y-4">
          {/* Delivery Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Delivery</p>
            <div className="mt-4 flex gap-3">
              <MapPin size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[var(--muted)]" />
              <div>
                <p className="text-sm font-semibold">{order.customerName}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{order.deliveryLocation}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{order.customerPhone}</p>
              </div>
            </div>
          </div>

          {/* Store Action Card */}
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Store Action</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              Pick all required units, verify finish and condition, then move the shipment to packing.
            </p>

            {order.status !== "packed" ? (
              <button
                type="button"
                onClick={handlePickingComplete}
                className="group mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg"
              >
                <Check size={14} />
                Mark picking complete
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-green-600" />
                  <p className="text-sm font-medium text-green-800">
                    Picking complete
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
