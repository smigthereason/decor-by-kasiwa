import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";
import { formatDateTime } from "@/lib/operations/selectors";

export default function AdminShipmentsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Shipments"
        title="From approval to delivery."
        body="Track every fulfilment handoff between the admin office, the physical store and the delivery partner."
      />

      <section className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:p-8">
        {shipments.map((shipment) => (
          <article 
            key={shipment.id} 
            className="rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-6"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {shipment.shipmentNumber} · {shipment.orderNumber}
                </p>
                <h2 className="mt-2 text-xl font-medium tracking-[-0.03em]">
                  {shipment.customerName}
                </h2>
              </div>
              <StatusPill value={shipment.status} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t hairline pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Destination
                </p>
                <p className="mt-2 text-sm">{shipment.destination}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Units
                </p>
                <p className="mt-2 text-sm">
                  {shipment.totalUnits} across {shipment.itemCount} lines
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Last update
                </p>
                <p className="mt-2 text-xs">{formatDateTime(shipment.updatedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Carrier
                </p>
                <p className="mt-2 text-xs">{shipment.carrier ?? "Not assigned"}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
