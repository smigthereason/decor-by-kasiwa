import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { notFound } from "next/navigation";

import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { inventory, orders } from "@/lib/operations/data";
import {
  availableStock,
  formatKes,
} from "@/lib/operations/selectors";

export default async function StoreOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = orders.find((item) => item.id === id && item.assignedStore);

  if (!order) notFound();

  return (
    <>
      <PageHeading
        eyebrow={`Pick List · ${order.orderNumber}`}
        title={order.customerName}
        body={`${order.total} order · ${order.deliveryLocation}`}
        actions={
          <Link
            href="/store/orders"
            className="inline-flex items-center gap-2 text-[8px] font-semibold uppercase tracking-[0.13em]"
          >
            <ArrowLeft size={12} /> Back to queue
          </Link>
        }
      />

      <section className="grid border-b border-black/[0.08] lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="bg-[#faf7f2] p-5 sm:p-7 lg:border-r lg:border-black/[0.08] lg:p-9">
          <div className="flex justify-between border-b border-black/[0.08] pb-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-black/35">
              Pick requirements
            </p>
            <StatusPill value={order.status} />
          </div>

          {order.lineItems.map((line, index) => {
            const stock = inventory.find(
              (item) =>
                item.productId === line.productId ||
                item.name === line.name
            );

            return (
              <article
                key={line.id}
                className="grid grid-cols-[36px_minmax(0,1fr)_100px_70px] gap-4 border-b border-black/[0.08] py-5"
              >
                <span className="text-[8px] text-black/35">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[11px] font-semibold">{line.name}</p>
                  <p className="mt-1 text-[8px] text-black/35">
                    {line.finish ?? "Standard"} · {formatKes(line.unitPrice)}
                  </p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-black/35">
                    Location
                  </p>
                  <p className="mt-1 text-[10px]">{stock?.location ?? "TBC"}</p>
                </div>
                <div>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-black/35">
                    Pick
                  </p>
                  <p className="mt-1 text-[15px] font-semibold">{line.quantity}</p>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="bg-[#e8dfcf] p-5 sm:p-7 lg:p-9">
          <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-black/35">
            Delivery
          </p>
          <div className="mt-5 flex gap-3">
            <MapPin size={15} strokeWidth={1.3} className="mt-0.5 text-black/40" />
            <div>
              <p className="text-[10px] font-semibold">{order.customerName}</p>
              <p className="mt-1 text-[9px] text-black/45">{order.deliveryLocation}</p>
              <p className="mt-1 text-[9px] text-black/45">{order.customerPhone}</p>
            </div>
          </div>

          <div className="mt-8 border-t border-black/[0.09] pt-5">
            <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-black/35">
              Store action
            </p>
            <p className="mt-3 text-[10px] leading-[1.65] text-black/48">
              Pick all required units, verify finish and condition, then move the
              shipment to packing.
            </p>

            <button
              type="button"
              className="mt-5 min-h-11 w-full bg-[#0e2b26] px-4 text-[8px] font-semibold uppercase tracking-[0.13em] text-white"
            >
              Mark picking complete
            </button>
          </div>
        </aside>
      </section>
    </>
  );
}
