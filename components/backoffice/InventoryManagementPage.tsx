"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowDownToLine, ArrowUpRight, Boxes, ChevronDown, History, PackagePlus, Search, Send } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import InventoryOverviewChart from "@/components/backoffice/InventoryOverviewChart";
import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";

type InventoryAction = "PURCHASE" | "RECEIVE" | "TRANSFER";

type InventoryMovement = {
  _id: string;
  movementNumber?: string;
  movementType: "PURCHASE" | "RECEIPT" | "TRANSFER";
  productName?: string;
  variantId?: string;
  variantLabel?: string;
  quantityChange?: number;
  stockBefore?: number;
  stockAfter?: number;
  incomingBefore?: number;
  incomingAfter?: number;
  sourceLocation?: string;
  destination?: string;
  unitCost?: number;
  movementValue?: number;
  actorName?: string;
  note?: string;
  createdAt?: string;
};

const actionCopy: Record<InventoryAction, { kicker: string; title: string; help: string; submit: string }> = {
  PURCHASE: {
    kicker: "Procurement",
    title: "Purchase stock from a supplier",
    help: "Purchase Stock records units you have bought as incoming. It does not increase sellable on-hand stock until those units are received into a store/location.",
    submit: "Record purchase",
  },
  RECEIVE: {
    kicker: "Goods receipt",
    title: "Receive purchased stock into a store/location",
    help: "Receive Stock moves previously purchased incoming units into the selected store/location and increases sellable on-hand stock.",
    submit: "Receive stock",
  },
  TRANSFER: {
    kicker: "Inventory transfer",
    title: "Record stock leaving the current store",
    help: "Transfers reduce sellable on-hand stock and record the destination for inventory traceability.",
    submit: "Record transfer",
  },
};

export default function InventoryManagementPage() {
  const { data: session } = useSession();
  const { data, loading, error, refresh } = useLiveOperations();
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "STORE" || role === "STORE_STAFF";
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("All");
  const [action, setAction] = useState<InventoryAction | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const actionSectionRef = useRef<HTMLElement | null>(null);

  function openAction(nextAction: InventoryAction) {
    setAction(nextAction);
    setMessage(null);
    setSelectedVariantId("");
    if (nextAction === "PURCHASE") setDestination("");
    window.requestAnimationFrame(() => {
      actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function loadMovements() {
    if (!canManage) return;
    try {
      const response = await fetch("/api/backoffice/inventory/movements", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { movements?: InventoryMovement[] };
      setMovements(payload.movements || []);
    } catch {
      // Inventory itself remains usable if movement history is temporarily unavailable.
    }
  }

  useEffect(() => { void loadMovements(); }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const inventory = data?.products || [];
  const locations = useMemo(() => ["All", ...Array.from(new Set(inventory.map((item) => item.location))).sort()], [inventory]);
  const filtered = inventory.filter((item) => {
    if (location !== "All" && item.location !== location) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return [item.name, item.sku, item.category].some((value) => value.toLowerCase().includes(term));
  });
  const selectedProduct = inventory.find((item) => item.id === selectedProductId);
  const selectedVariant = selectedProduct?.variants?.find((variant) => variant.id === selectedVariantId);
  const requiresVariant = Boolean(selectedProduct?.variants?.length);

  async function submitMovement() {
    if (!action || !selectedProductId || (requiresVariant && !selectedVariantId)) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = (await mutateBackoffice("/api/backoffice/inventory/movements", {
        action,
        productId: selectedProductId,
        variantId: selectedVariantId || undefined,
        quantity: Number(quantity),
        destination,
        note,
      }, "POST")) as { stockAfter?: number; incomingAfter?: number };

      if (action === "PURCHASE") {
        setMessage(`Purchase recorded. Incoming stock: ${payload.incomingAfter ?? "updated"}.`);
      } else if (action === "RECEIVE") {
        setMessage(`Stock received. On hand: ${payload.stockAfter ?? "updated"}; incoming: ${payload.incomingAfter ?? "updated"}.`);
      } else {
        setMessage(`Stock transferred. Remaining on hand: ${payload.stockAfter ?? "updated"}.`);
      }
      setQuantity("1");
      setDestination("");
      setNote("");
      setSelectedProductId("");
      setSelectedVariantId("");
      await Promise.all([refresh(), loadMovements()]);
      window.requestAnimationFrame(() => actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to update inventory.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker text-[var(--muted)]">Inventory</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Stock control</h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Record purchases, receive incoming goods into a store/location, transfer stock, and keep variant quantities aligned with the live shop/POS total.</p>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openAction("PURCHASE")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold !text-soft-cream"><PackagePlus size={14}/>Purchase stock</button>
              <button type="button" onClick={() => openAction("RECEIVE")} className="inline-flex min-h-11 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-xs font-semibold"><ArrowDownToLine size={14}/>Receive stock</button>
              <button type="button" onClick={() => openAction("TRANSFER")} className="inline-flex min-h-11 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-xs font-semibold"><Send size={14}/>Transfer stock</button>
            </div>
          )}
        </div>
      </div>

      {canManage && <div className="p-4 pb-0 sm:p-6 sm:pb-0 lg:p-8 lg:pb-0"><InventoryOverviewChart /></div>}

      {canManage && action && (
        <section ref={actionSectionRef} className="scroll-mt-6 mx-4 mt-6 rounded-2xl border hairline bg-[var(--paper)] p-4 sm:mx-6 sm:p-6 lg:mx-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="kicker text-[var(--muted)]">{actionCopy[action].kicker}</p><h2 className="mt-2 text-xl font-semibold">{actionCopy[action].title}</h2></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap rounded-2xl border hairline bg-[var(--paper-2)] p-1 sm:rounded-full">
                {(["PURCHASE", "RECEIVE", "TRANSFER"] as InventoryAction[]).map((value) => (
                  <button key={value} type="button" onClick={() => openAction(value)} className={`rounded-full px-4 py-2 text-xs font-semibold transition ${action === value ? "bg-[var(--brand-green)] !text-soft-cream" : "text-[var(--ink)]"}`}>
                    {value === "PURCHASE" ? "Purchase stock" : value === "RECEIVE" ? "Receive stock" : "Transfer stock"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAction(null)} className="px-2 py-2 text-xs underline">Cancel</button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-12">
            <label className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-4">
              Product
              <div className="relative min-w-0">
                <select value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setSelectedVariantId(""); }} className="min-h-12 w-full min-w-0 appearance-none rounded-xl border hairline bg-white py-2.5 pl-4 pr-11 font-normal">
                  <option value="">Select product</option>
                  {inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
              </div>
            </label>

            {requiresVariant && (
              <label className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-3">
                Variant
                <div className="relative min-w-0">
                  <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)} className="min-h-12 w-full appearance-none rounded-xl border hairline bg-white py-2.5 pl-4 pr-11 font-normal">
                    <option value="">Select variant</option>
                    {selectedProduct?.variants?.map((variant) => (
                      <option key={variant.id} value={variant.id}>{variant.title || [variant.colour, variant.size].filter(Boolean).join(" · ") || variant.sku || "Variant"} · {variant.stockQuantity} on hand</option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
                </div>
              </label>
            )}

            <label className={`grid min-w-0 gap-2 text-xs font-semibold ${requiresVariant ? "lg:col-span-2" : "lg:col-span-2"}`}>
              Quantity
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="min-h-12 w-full rounded-xl border hairline bg-white px-4 py-2.5 font-normal"/>
            </label>

            {(action === "RECEIVE" || action === "TRANSFER") && (
              <label className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-3">
                {action === "RECEIVE" ? "Store / location" : "Destination"}
                <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={action === "RECEIVE" ? "e.g. Main store, Westlands" : "e.g. Jumia, showroom, event"} className="min-h-12 w-full rounded-xl border hairline bg-white px-4 py-2.5 font-normal"/>
              </label>
            )}

            <label className={`grid min-w-0 gap-2 text-xs font-semibold ${action === "PURCHASE" ? (requiresVariant ? "lg:col-span-3" : "lg:col-span-6") : "lg:col-span-12"}`}>
              Note / reference
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={action === "PURCHASE" ? "Supplier, invoice or PO reference" : "Optional reference"} className="min-h-12 w-full rounded-xl border hairline bg-white px-4 py-2.5 font-normal"/>
            </label>
          </div>

          {selectedProduct && (
            <div className="mt-4 grid gap-3 rounded-xl border hairline bg-[var(--paper-2)] p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Total on hand</p><p className="mt-1 font-semibold">{selectedProduct.onHand}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Incoming</p><p className="mt-1 font-semibold">{selectedProduct.incoming}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">{selectedVariant ? "Variant on hand" : "Procurement cost / unit"}</p><p className="mt-1 font-semibold">{selectedVariant ? selectedVariant.stockQuantity : formatKes(selectedProduct.unitCost)}</p></div>
              <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Movement value</p><p className="mt-1 font-semibold">{formatKes(Math.max(0, Number(quantity || 0)) * selectedProduct.unitCost)}</p></div>
            </div>
          )}

          {message && <div role="status" aria-live="polite" className="mt-5 rounded-xl border hairline bg-[var(--paper-2)] px-4 py-3 text-xs font-medium">{message}</div>}
          <div className="mt-5 flex flex-col gap-3 border-t hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-[10px] leading-relaxed text-[var(--muted)]">{actionCopy[action].help}</p>
            <button
              type="button"
              disabled={saving || !selectedProductId || Number(quantity) <= 0 || (requiresVariant && !selectedVariantId) || ((action === "RECEIVE" || action === "TRANSFER") && !destination.trim())}
              onClick={() => void submitMovement()}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-6 text-xs font-semibold !text-soft-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === "PURCHASE" ? <PackagePlus size={14}/> : action === "RECEIVE" ? <ArrowDownToLine size={14}/> : <Send size={14}/>}
              {saving ? "Saving…" : actionCopy[action].submit}
            </button>
          </div>
        </section>
      )}

      <div className={`${action ? "mt-6" : "mt-4"} border-y hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8`}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1"><Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, SKU or category..." className="min-h-12 w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--brand-green)]"/></div>
          <div className="relative min-w-52"><select value={location} onChange={(event) => setLocation(event.target.value)} className="min-h-12 w-full appearance-none rounded-full border hairline bg-[var(--paper)] py-3 pl-4 pr-11 text-sm">{locations.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></div>
          <div className="sm:ml-auto"><ExportButtons title="Store Inventory" columns={[{key:"name",label:"Product"},{key:"sku",label:"SKU"},{key:"category",label:"Category"},{key:"location",label:"Location"},{key:"onHand",label:"On Hand"},{key:"reserved",label:"Reserved"},{key:"available",label:"Available Stock"},{key:"incoming",label:"Incoming"},{key:"unitCost",label:"Procurement Cost"},{key:"price",label:"Retail Price"}]} rows={filtered.map((item)=>({name:item.name,sku:item.sku,category:item.category,location:item.location,onHand:item.onHand,reserved:item.reserved,available:availableStock(item),incoming:item.incoming,unitCost:item.unitCost,price:item.retailPrice}))}/></div>
        </div>
      </div>

      {canManage && movements.length > 0 && (
        <section className="px-4 pt-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]">
            <div className="flex items-center gap-2 border-b hairline px-4 py-4 sm:px-5"><History size={15} className="text-[var(--brand-green)]"/><div><h2 className="text-sm font-semibold">Recent stock movements</h2><p className="mt-0.5 text-[10px] text-[var(--muted)]">Purchases, receipts into a store/location, and stock transfers.</p></div></div>
            <div className="max-h-80 overflow-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="sticky top-0 bg-[var(--paper)]"><tr className="border-b hairline">{["Date","Movement","Product / variant","Qty","From / To","Procurement value","Recorded by","Reference / note"].map((heading)=><th key={heading} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{heading}</th>)}</tr></thead>
                <tbody>{movements.slice(0, 40).map((movement) => {
                  const label = movement.movementType === "PURCHASE" ? "Purchase stock" : movement.movementType === "RECEIPT" ? "Receive stock" : "Transfer / stock out";
                  const route = movement.movementType === "PURCHASE" ? "Supplier → Incoming" : `${movement.sourceLocation || "Main store"}${movement.destination ? ` → ${movement.destination}` : ""}`;
                  return <tr key={movement._id} className="border-b hairline last:border-0"><td className="px-4 py-3 text-xs">{movement.createdAt ? new Date(movement.createdAt).toLocaleString("en-KE") : "—"}</td><td className="px-4 py-3 text-xs font-semibold">{label}</td><td className="px-4 py-3 text-xs">{movement.productName || "Product"}{movement.variantLabel ? <><br/><span className="text-[10px] text-[var(--muted)]">{movement.variantLabel}</span></> : null}</td><td className="px-4 py-3 text-xs font-semibold tabular-nums">{movement.quantityChange && movement.quantityChange > 0 ? `+${movement.quantityChange}` : movement.quantityChange ?? 0}</td><td className="px-4 py-3 text-xs text-[var(--muted)]">{route}</td><td className="px-4 py-3 text-xs">{formatKes(Number(movement.movementValue || 0))}</td><td className="px-4 py-3 text-xs">{movement.actorName || "—"}</td><td className="px-4 py-3 text-[10px] text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{movement.movementNumber || "—"}</span>{movement.note ? <><br/>{movement.note}</> : null}</td></tr>;
                })}</tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="p-4 sm:p-6 lg:p-8">
        {filtered.length ? <div className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]"><div className="max-w-full overflow-x-auto"><table className="w-full min-w-[1080px] text-left"><thead><tr className="border-b hairline">{["Product","SKU","Location","On hand","Reserved","Available","Incoming","Status","Cost","Retail",""].map((heading)=><th key={heading} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{heading}</th>)}</tr></thead><tbody>{filtered.map((item)=><tr key={item.id} className="border-b hairline last:border-0"><td className="px-4 py-4 text-sm font-semibold">{item.name}{item.variants?.length ? <span className="ml-2 text-[9px] font-normal text-[var(--muted)]">{item.variants.length} variants</span> : null}</td><td className="px-4 py-4 text-xs">{item.sku}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{item.location}</td><td className="px-4 py-4 text-xs font-semibold">{item.onHand}</td><td className="px-4 py-4 text-xs">{item.reserved}</td><td className="px-4 py-4 text-xs font-semibold">{availableStock(item)}</td><td className="px-4 py-4 text-xs">{item.incoming}</td><td className="px-4 py-4"><StatusPill value={stockStatus(item)}/></td><td className="px-4 py-4 text-xs">{formatKes(item.unitCost)}</td><td className="px-4 py-4 text-xs font-semibold">{formatKes(item.retailPrice)}</td><td className="px-4 py-4 text-right"><Link href={`/shop/${item.slug || ""}`} className="group inline-grid size-9 place-items-center rounded-full border hairline hover:border-[var(--brand-green)]" aria-label={`Open ${item.name} in shop`}><ArrowUpRight size={14}/></Link></td></tr>)}</tbody></table></div></div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Boxes size={32} className="mx-auto text-[var(--muted)]"/><p className="mt-4 text-sm font-medium">No matching inventory found</p></div>}
      </section>
    </div>
  );
}
