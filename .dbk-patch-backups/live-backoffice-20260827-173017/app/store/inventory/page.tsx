"use client";

import { useState } from "react";
import { Search, MapPin, Boxes, TrendingUp, Package } from "lucide-react";
import StatusPill from "@/components/backoffice/StatusPill";
import { inventory } from "@/lib/operations/data";
import {
  availableStock,
  stockStatus,
} from "@/lib/operations/selectors";

export default function StoreInventoryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("All");

  const filteredInventory = inventory.filter((item) => {
    if (locationFilter !== "All" && item.location !== locationFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        item.name.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term) ||
        item.location.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const locations = ["All", ...new Set(inventory.map((item) => item.location))];

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <p className="kicker text-[var(--muted)]">Inventory</p>
        <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Product Inventory
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          The store-focused stock view prioritises physical location, available units, reservations and incoming replenishment.
        </p>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {locations.map((location) => (
              <button
                key={location}
                type="button"
                onClick={() => setLocationFilter(location)}
                className={`rounded-full px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all sm:px-4 sm:text-[10px] ${
                  locationFilter === location
                    ? "bg-[var(--ink)] !text-white"
                    : "border hairline text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
              >
                {location}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search inventory..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
            />
          </div>
        </div>
      </div>

      {/* INVENTORY CARDS */}
      <section className="p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {filteredInventory.map((item) => (
            <article
              key={item.id}
              className="group rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    {item.sku}
                  </p>
                  <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] sm:text-lg">
                    {item.name}
                  </h2>
                </div>
                <StatusPill value={stockStatus(item)} />
              </div>

              {/* Stock Details */}
              <div className="mt-4 grid grid-cols-4 gap-3 border-t hairline pt-4">
                <div>
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <MapPin size={10} />
                    Shelf
                  </p>
                  <p className="mt-1.5 text-sm font-semibold">{item.location}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <Boxes size={10} />
                    On Hand
                  </p>
                  <p className="mt-1.5 text-sm font-semibold">{item.onHand}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <Package size={10} />
                    Reserved
                  </p>
                  <p className="mt-1.5 text-sm font-semibold">{item.reserved}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    <TrendingUp size={10} />
                    Available
                  </p>
                  <p className="mt-1.5 text-sm font-semibold">{availableStock(item)}</p>
                </div>
              </div>

              {/* Incoming */}
              <div className="mt-4 flex items-center justify-between border-t hairline pt-3">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  Incoming
                </span>
                <span className="text-sm font-semibold">{item.incoming} units</span>
              </div>
            </article>
          ))}

          {filteredInventory.length === 0 && (
            <div className="col-span-full rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
              <Boxes size={32} className="mx-auto text-[var(--muted)]" />
              <p className="mt-4 text-sm font-medium">No inventory found</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Try adjusting your filters or search term.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
