import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";

const columns = [
  ["awaiting_store", "Receive"],
  ["received", "Received"],
  ["picking", "Picking"],
  ["packed", "Packed"],
  ["ready_dispatch", "Dispatch Ready"],
] as const;

export default function StoreShipmentsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Shipment Board"
        title="Receive. Pick. Pack. Dispatch."
        body="A physical-workflow view of every shipment moving through the store."
      />

      <section className="overflow-x-auto bg-[#e8dfcf] p-4 sm:p-6">
        <div className="grid min-w-[1100px] grid-cols-5 gap-3">
          {columns.map(([status, label], columnIndex) => {
            const columnShipments = shipments.filter(
              (shipment) => shipment.status === status
            );

            return (
              <div key={status}>
                <div className="mb-3 flex items-center justify-between border-b border-black/[0.12] pb-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em]">
                    {String(columnIndex + 1).padStart(2, "0")} · {label}
                  </p>
                  <span className="text-[8px] text-black/35">{columnShipments.length}</span>
                </div>

                <div className="space-y-3">
                  {columnShipments.length === 0 ? (
                    <div className="min-h-[120px] border border-dashed border-black/10 p-4 text-[9px] text-black/30">
                      No shipments
                    </div>
                  ) : (
                    columnShipments.map((shipment) => (
                      <article key={shipment.id} className="bg-[#faf7f2] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-[8px] font-semibold">
                            {shipment.shipmentNumber}
                          </span>
                          <StatusPill value={shipment.status} />
                        </div>
                        <h2 className="mt-5 text-[18px] font-medium tracking-[-0.035em]">
                          {shipment.orderNumber}
                        </h2>
                        <p className="mt-1 text-[9px] text-black/45">
                          {shipment.customerName}
                        </p>
                        <div className="mt-4 border-t border-black/[0.08] pt-3 text-[8px] text-black/40">
                          {shipment.totalUnits} units · {shipment.destination}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
