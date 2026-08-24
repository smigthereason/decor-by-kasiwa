import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { shipments } from "@/lib/operations/data";

export default function StoreDispatchPage() {
  const dispatchable = shipments.filter((shipment) =>
    ["packed", "ready_dispatch", "dispatched"].includes(shipment.status)
  );

  return (
    <>
      <PageHeading
        eyebrow="Dispatch"
        title="The final store handoff."
        body="Assign the carrier, confirm the tracking reference and record when a packed shipment leaves the store."
      />

      <section className="bg-[#faf7f2] p-5 sm:p-7 lg:p-9">
        {dispatchable.length === 0 ? (
          <div className="border border-dashed border-black/12 px-6 py-16 text-center">
            <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-black/35">
              Dispatch queue
            </p>
            <h2 className="mt-4 text-[28px] font-medium tracking-[-0.045em]">
              Nothing waiting at the dispatch desk.
            </h2>
          </div>
        ) : (
          <div className="grid gap-px bg-black/[0.08] lg:grid-cols-2">
            {dispatchable.map((shipment) => (
              <article key={shipment.id} className="bg-[#faf7f2] p-5">
                <div className="flex justify-between gap-5">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.14em] text-black/35">
                      {shipment.shipmentNumber} · {shipment.orderNumber}
                    </p>
                    <h2 className="mt-3 text-[22px] font-medium tracking-[-0.04em]">
                      {shipment.customerName}
                    </h2>
                  </div>
                  <StatusPill value={shipment.status} />
                </div>

                <div className="mt-6 border-t border-black/[0.08] pt-4 text-[9px]">
                  <p>{shipment.destination}</p>
                  <p className="mt-1 text-black/40">
                    {shipment.carrier ?? "Carrier not assigned"}
                    {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
                  </p>
                </div>

                {shipment.status !== "dispatched" && (
                  <button
                    type="button"
                    className="mt-5 min-h-10 w-full bg-[#0e2b26] px-4 text-[8px] font-semibold uppercase tracking-[0.13em] text-white"
                  >
                    Dispatch shipment
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
