import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  PackageCheck,
  PackageOpen,
  Truck,
} from "lucide-react";

import MetricCard from "@/components/backoffice/MetricCard";
import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";
import { formatDateTime, storeMetrics } from "@/lib/operations/selectors";

export default function StoreDashboardPage() {
  const metrics = storeMetrics();

  return (
    <>
      <PageHeading
        eyebrow="Store Operations"
        title="From shelf to doorstep."
        body="The physical fulfilment workspace. Receive admin-approved shipments, reserve stock, pick and pack items, then dispatch them for delivery."
        actions={
          <Link
            href="/store/shipments"
            className="inline-flex min-h-10 items-center gap-3 bg-[#0e2b26] px-4 text-[8px] font-semibold uppercase tracking-[0.13em] text-white"
          >
            Open shipment queue <ArrowRight size={12} />
          </Link>
        }
      />

      <section className="grid border-b border-black/[0.08] sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          index="01"
          label="Awaiting receipt"
          value={String(metrics.awaitingReceipt).padStart(2, "0")}
          detail="Admin-approved shipments waiting for the store team to accept."
          icon={PackageOpen}
        />
        <MetricCard
          index="02"
          label="Picking"
          value={String(metrics.beingPicked).padStart(2, "0")}
          detail="Orders currently being picked from inventory locations."
          icon={Boxes}
        />
        <MetricCard
          index="03"
          label="Ready dispatch"
          value={String(metrics.readyToDispatch).padStart(2, "0")}
          detail="Packed shipments waiting for carrier handoff."
          icon={PackageCheck}
        />
        <MetricCard
          index="04"
          label="Stock attention"
          value={String(metrics.lowStock).padStart(2, "0")}
          detail="Inventory lines that need replenishment or review."
          icon={Truck}
        />
      </section>

      <section className="bg-[#faf7f2] p-5 sm:p-7 lg:p-9">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-black/35">
              Fulfilment queue
            </p>
            <h2 className="mt-2 text-[30px] font-medium tracking-[-0.045em]">
              What the store needs to move next.
            </h2>
          </div>

          <Link
            href="/store/shipments"
            className="text-[8px] font-semibold uppercase tracking-[0.13em] underline underline-offset-4"
          >
            View queue
          </Link>
        </div>

        <div className="grid gap-px bg-black/[0.08] xl:grid-cols-2">
          {shipments
            .filter((shipment) => shipment.status !== "delivered")
            .map((shipment) => (
              <article key={shipment.id} className="bg-[#faf7f2] p-5">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-black/35">
                      {shipment.shipmentNumber}
                    </p>
                    <h3 className="mt-3 text-[23px] font-medium tracking-[-0.04em]">
                      {shipment.orderNumber} · {shipment.customerName}
                    </h3>
                  </div>
                  <StatusPill value={shipment.status} />
                </div>

                <div className="mt-7 grid grid-cols-3 border-t border-black/[0.08] pt-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.12em] text-black/35">
                      Destination
                    </p>
                    <p className="mt-2 text-[9px]">{shipment.destination}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.12em] text-black/35">
                      Units
                    </p>
                    <p className="mt-2 text-[9px]">{shipment.totalUnits}</p>
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.12em] text-black/35">
                      Updated
                    </p>
                    <p className="mt-2 text-[8px]">{formatDateTime(shipment.updatedAt)}</p>
                  </div>
                </div>
              </article>
            ))}
        </div>
      </section>
    </>
  );
}
