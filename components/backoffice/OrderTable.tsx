import Link from "next/link";
import { ArrowUpRight, Store } from "lucide-react";

import type { Order } from "@/lib/operations/types";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";
import StatusPill from "./StatusPill";

type Props = {
  orders: Order[];
  mode?: "admin" | "store";
  compact?: boolean;
};

function orderHref(order: Order, mode: "admin" | "store") {
  return mode === "admin" ? `/admin/orders/${order.id}` : `/store/orders/${order.id}`;
}

function channelLabel(order: Order) {
  return order.salesChannel === "POS" ? "POS" : "Online";
}

export default function OrderTable({ orders, mode = "admin", compact = false }: Props) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {orders.map((order) => (
          <article
            key={order.id}
            className="min-w-0 rounded-xl border hairline bg-[var(--paper)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-xs font-semibold">{order.orderNumber}</p>
                  <span className="rounded-full bg-[var(--paper-2)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">
                    {channelLabel(order)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{order.customerName}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  {formatDateTime(order.createdAt)}
                </p>
              </div>

              <Link
                href={orderHref(order, mode)}
                className="group inline-grid size-9 shrink-0 place-items-center rounded-full border border-[var(--ink)]/10 transition-colors hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                aria-label={`Open ${order.orderNumber}`}
              >
                <ArrowUpRight
                  size={13}
                  strokeWidth={1.4}
                  className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill value={order.status} />
              <StatusPill value={order.paymentStatus} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-3 text-[10px]">
              <div>
                <p className="uppercase tracking-[0.08em] text-[var(--muted)]">Total</p>
                <p className="mt-1 text-sm font-semibold">{formatKes(order.total)}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.08em] text-[var(--muted)]">Sold by</p>
                <p className="mt-1 truncate text-xs font-medium">
                  {order.salesChannel === "POS"
                    ? order.soldByName || "Staff"
                    : "Online checkout"}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[1050px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--ink)]/[0.08]">
              {[
                "Order",
                "Channel",
                "Customer",
                "Sold by",
                "Placed",
                "Status",
                "Payment",
                "Total",
                "",
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] first:pl-0 last:pr-0"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-[var(--ink)]/[0.07] align-top"
              >
                <td className="py-4 pr-4">
                  <p className="text-[11px] font-semibold">{order.orderNumber}</p>
                  {!compact && (
                    <p className="mt-1 text-[9px] text-[var(--muted)]">
                      {order.lineItems.length} line items
                    </p>
                  )}
                </td>

                <td className="px-4 py-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--paper-2)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">
                    {order.salesChannel === "POS" && <Store size={11} />}
                    {channelLabel(order)}
                  </span>
                </td>

                <td className="px-4 py-4">
                  <p className="text-[10px] font-medium">{order.customerName}</p>
                  {!compact && (
                    <p className="mt-1 max-w-52 truncate text-[9px] text-[var(--muted)]">
                      {order.deliveryLocation}
                    </p>
                  )}
                </td>

                <td className="px-4 py-4">
                  <p className="max-w-40 truncate text-[10px] font-medium">
                    {order.salesChannel === "POS"
                      ? order.soldByName || "Staff"
                      : "Online checkout"}
                  </p>
                  {order.salesChannel === "POS" && order.soldByRole && (
                    <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      {order.soldByRole.replaceAll("_", " ")}
                    </p>
                  )}
                </td>

                <td className="px-4 py-4 text-[9px] text-[var(--muted)]">
                  {formatDateTime(order.soldAt || order.createdAt)}
                </td>

                <td className="px-4 py-4">
                  <StatusPill value={order.status} />
                </td>

                <td className="px-4 py-4">
                  <StatusPill value={order.paymentStatus} />
                </td>

                <td className="px-4 py-4 text-[10px] font-semibold">
                  {formatKes(order.total)}
                </td>

                <td className="py-4 pl-4 text-right">
                  <Link
                    href={orderHref(order, mode)}
                    className="group inline-grid size-9 place-items-center rounded-full border border-[var(--ink)]/10 transition-colors hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                    aria-label={`Open ${order.orderNumber}`}
                  >
                    <ArrowUpRight
                      size={13}
                      strokeWidth={1.4}
                      className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
