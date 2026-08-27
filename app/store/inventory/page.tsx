"use client";

import { useMemo, useState } from "react";
import { Boxes, Search } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";

export default function StoreInventoryPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const inventory = data?.products || [];
  const locations = useMemo(() => ["All", ...Array.from(new Set(inventory.map((item) => item.location))).sort()], [inventory]);
  const filtered = inventory.filter((item) => {
    if (location !== "All" && item.location !== location) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [item.name, item.sku, item.category].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Inventory</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live Sanity inventory</h1><p className="mt-3 text-sm text-[var(--muted)]">On-hand stock comes from each live product. Operational fields come from its inventory record.</p></div><div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative max-w-sm flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inventory..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div><select value={location} onChange={(e) => setLocation(e.target.value)} className="rounded-full border hairline bg-[var(--paper)] px-4 text-sm">{locations.map((item) => <option key={item}>{item}</option>)}</select></div></div><section className="p-4 sm:p-6 lg:p-8">{filtered.length ? <div className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]"><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead><tr className="border-b hairline">{['Product','SKU','Location','On hand','Reserved','Available','Incoming','Status','Price'].map((h) => <th key={h} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{h}</th>)}</tr></thead><tbody>{filtered.map((item) => <tr key={item.id} className="border-b hairline last:border-0"><td className="px-4 py-4 text-sm font-semibold">{item.name}</td><td className="px-4 py-4 text-xs">{item.sku}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{item.location}</td><td className="px-4 py-4 text-xs font-semibold">{item.onHand}</td><td className="px-4 py-4 text-xs">{item.reserved}</td><td className="px-4 py-4 text-xs font-semibold">{availableStock(item)}</td><td className="px-4 py-4 text-xs">{item.incoming}</td><td className="px-4 py-4"><StatusPill value={stockStatus(item)} /></td><td className="px-4 py-4 text-xs font-semibold">{formatKes(item.retailPrice)}</td></tr>)}</tbody></table></div></div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Boxes size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live inventory found</p></div>}</section></div>;
}
