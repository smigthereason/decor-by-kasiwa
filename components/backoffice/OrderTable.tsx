import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { Order } from "@/lib/operations/types";
import { formatDateTime, formatKes } from "@/lib/operations/selectors";
import StatusPill from "./StatusPill";

type Props = {
  orders: Order[];
  mode?: "admin" | "store";
  compact?: boolean;
};

export default function OrderTable({
  orders,
  mode = "admin",
  compact = false,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--ink)]/[0.08]">
            {["Order", "Customer", "Placed", "Status", "Payment", "Total", ""].map(
              (heading) => (
                <th
                  key={heading}
                  className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] first:pl-0 last:pr-0"
                >
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-[var(--ink)]/[0.07] align-top">
              <td className="py-4 pr-4">
                <p className="text-[11px] font-semibold">{order.orderNumber}</p>
                {!compact && (
                  <p className="mt-1 text-[9px] text-[var(--muted)]">
                    {order.lineItems.length} line items
                  </p>
                )}
              </td>

              <td className="px-4 py-4">
                <p className="text-[10px] font-medium">{order.customerName}</p>
                {!compact && (
                  <p className="mt-1 text-[9px] text-[var(--muted)]">
                    {order.deliveryLocation}
                  </p>
                )}
              </td>

              <td className="px-4 py-4 text-[9px] text-[var(--muted)]">
                {formatDateTime(order.createdAt)}
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
                  href={
                    mode === "admin"
                      ? `/admin/orders/${order.id}`
                      : `/store/orders/${order.id}`
                  }
                  className="inline-grid size-8 place-items-center rounded-full border border-[var(--ink)]/10 transition-colors hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                  aria-label={`Open ${order.orderNumber}`}
                >
                  <ArrowUpRight size={13} strokeWidth={1.4} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
