"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, Truck } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { formatDateTime } from "@/lib/operations/selectors";

export default function AdminShipmentsPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const shipments = data?.shipments || [];
  const statuses = useMemo(() => ["All", ...Array.from(new Set(shipments.map((item) => item.status)))], [shipments]);
  const filtered = shipments.filter((shipment) => {
    if (status !== "All" && shipment.status !== status) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [shipment.shipmentNumber, shipment.orderNumber, shipment.customerName, shipment.destination].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return <div className="min-h-full bg-[var(--paper-2)]"><div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10"><p className="kicker text-[var(--muted)]">Shipments</p><h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Live fulfilment shipments</h1></div><div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative max-w-sm flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search shipments..." className="w-full rounded-full border hairline py-2.5 pl-9 pr-4 text-sm outline-none" /></div><div className="relative min-w-52"><select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10">{statuses.map((item) => <option key={item}>{item.replaceAll("_", " ")}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /></div></div></div><section className="p-4 sm:p-6 lg:p-8">{filtered.length ? <div className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b hairline">{['Shipment','Order','Customer','Destination','Updated','Status'].map((h) => <th key={h} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{h}</th>)}</tr></thead><tbody>{filtered.map((shipment) => <tr key={shipment.id} className="border-b hairline last:border-0"><td className="px-4 py-4 text-xs font-semibold">{shipment.shipmentNumber}</td><td className="px-4 py-4 text-xs">{shipment.orderNumber}</td><td className="px-4 py-4 text-xs">{shipment.customerName}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{shipment.destination}</td><td className="px-4 py-4 text-[10px] text-[var(--muted)]">{formatDateTime(shipment.updatedAt)}</td><td className="px-4 py-4"><StatusPill value={shipment.status} /></td></tr>)}</tbody></table></div></div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--muted)]" /><p className="mt-4 text-sm font-medium">No live shipments found</p></div>}</section></div>;
}
