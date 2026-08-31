"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Boxes, ChevronDown, Search } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";

export default function StoreInventoryPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const inventory = data?.products || [];
  const locations = useMemo(
    () => ["All", ...Array.from(new Set(inventory.map((item) => item.location))).sort()],
    [inventory],
  );
  const filtered = inventory.filter((item) => {
    if (location !== "All" && item.location !== location) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [item.name, item.sku, item.category].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Inventory lookup</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Check live availability</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          This view is read-only for Sales Staff. Search the live catalogue to answer customer availability questions quickly.
        </p>
      </div>
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, SKU or category..."
              className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            />
          </div>
          <div className="relative min-w-52">
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            >
              {locations.map((item) => <option key={item}>{item}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          </div>
          <div className="sm:ml-auto"><ExportButtons title="Store Inventory" columns={[{key:"name",label:"Product"},{key:"sku",label:"SKU"},{key:"category",label:"Category"},{key:"location",label:"Location"},{key:"onHand",label:"On Hand"},{key:"reserved",label:"Reserved"},{key:"available",label:"Available Stock"},{key:"incoming",label:"Incoming"},{key:"price",label:"Price (KES)"}]} rows={filtered.map((item)=>({name:item.name,sku:item.sku,category:item.category,location:item.location,onHand:item.onHand,reserved:item.reserved,available:availableStock(item),incoming:item.incoming,price:item.retailPrice}))}/></div>
        </div>
      </div>
      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? (
          <>
            <div className="grid gap-3 md:hidden">
              {filtered.map((item) => (
                <article key={item.id} className="min-w-0 rounded-xl border hairline bg-[var(--paper)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{item.sku} · {item.category}</p>
                    </div>
                    <Link
                      href={`/shop/${item.slug || ""}`}
                      className="group inline-grid size-9 shrink-0 place-items-center rounded-full border hairline transition hover:border-[var(--deep-green)] hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                      aria-label={`Open ${item.name} in shop`}
                    >
                      <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusPill value={stockStatus(item)} />
                    <span className="text-[10px] text-[var(--muted)]">{item.location}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t hairline pt-3 text-xs">
                    <div><dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Available</dt><dd className="mt-1 font-semibold">{availableStock(item)}</dd></div>
                    <div><dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">On hand</dt><dd className="mt-1 font-semibold">{item.onHand}</dd></div>
                    <div><dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Incoming</dt><dd className="mt-1 font-semibold">{item.incoming}</dd></div>
                    <div><dt className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Price</dt><dd className="mt-1 font-semibold">{formatKes(item.retailPrice)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border hairline bg-[var(--paper)] md:block">
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[950px] text-left">
                <thead>
                  <tr className="border-b hairline">
                    {["Product", "SKU", "Location", "On hand", "Reserved", "Available", "Incoming", "Status", "Price", ""].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id} className="border-b hairline last:border-0">
                      <td className="px-4 py-4 text-sm font-semibold">{item.name}</td>
                      <td className="px-4 py-4 text-xs">{item.sku}</td>
                      <td className="px-4 py-4 text-xs text-[var(--muted)]">{item.location}</td>
                      <td className="px-4 py-4 text-xs font-semibold">{item.onHand}</td>
                      <td className="px-4 py-4 text-xs">{item.reserved}</td>
                      <td className="px-4 py-4 text-xs font-semibold">{availableStock(item)}</td>
                      <td className="px-4 py-4 text-xs">{item.incoming}</td>
                      <td className="px-4 py-4"><StatusPill value={stockStatus(item)} /></td>
                      <td className="px-4 py-4 text-xs font-semibold">{formatKes(item.retailPrice)}</td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/shop/${item.slug || ""}`}
                          className="group inline-grid size-9 place-items-center rounded-full border hairline transition hover:border-[var(--deep-green)] hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                          aria-label={`Open ${item.name} in shop`}
                        >
                          <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
            <Boxes size={32} className="mx-auto text-[var(--muted)]" />
            <p className="mt-4 text-sm font-medium">No matching inventory found</p>
          </div>
        )}
      </section>
    </div>
  );
}
