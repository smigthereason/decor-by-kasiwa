import PageHeading from "@/components/backoffice/PageHeading";
import StatusPill from "@/components/backoffice/StatusPill";
import { inventory } from "@/lib/operations/data";
import {
  availableStock,
  stockStatus,
} from "@/lib/operations/selectors";

export default function StoreInventoryPage() {
  return (
    <>
      <PageHeading
        eyebrow="Inventory"
        title="Know exactly what is on the shelf."
        body="The store-focused stock view prioritises physical location, available units, reservations and incoming replenishment."
      />

      <section className="grid gap-px bg-black/[0.08] lg:grid-cols-2 xl:grid-cols-3">
        {inventory.map((item) => (
          <article key={item.id} className="bg-[#faf7f2] p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-black/35">
                  {item.sku}
                </p>
                <h2 className="mt-3 text-[21px] font-medium tracking-[-0.04em]">
                  {item.name}
                </h2>
              </div>
              <StatusPill value={stockStatus(item)} />
            </div>

            <div className="mt-7 grid grid-cols-4 border-t border-black/[0.08] pt-4">
              {[
                ["Shelf", item.location],
                ["On hand", item.onHand],
                ["Reserved", item.reserved],
                ["Available", availableStock(item)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[7px] uppercase tracking-[0.11em] text-black/35">
                    {label}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-between border-t border-black/[0.08] pt-4">
              <span className="text-[8px] uppercase tracking-[0.11em] text-black/35">
                Incoming
              </span>
              <span className="text-[10px] font-semibold">{item.incoming} units</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
