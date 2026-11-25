"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { ArrowDownToLine, ArrowUpRight, Boxes, ChevronDown, History, PackagePlus, Pencil, Search, Send } from "lucide-react";

import ExportButtons from "@/components/backoffice/ExportButtons";
import InventoryOverviewChart from "@/components/backoffice/InventoryOverviewChart";
import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";
import type { InventoryItem } from "@/lib/operations/types";
import { fullInventoryReportRows } from "@/lib/operations/full-inventory-report";
import { inventoryQuantityFromMagnitude } from "@/lib/inventory/receive-quantity";

type InventoryAction = "PURCHASE" | "RECEIVE" | "TRANSFER";
type MovementFilters = { q: string; from: string; to: string; type: string };
const EMPTY_MOVEMENT_FILTERS: MovementFilters = { q: "", from: "", to: "", type: "" };
type StoreLocation = { _id: string; name: string; code?: string; active?: boolean };

type InventoryMovement = {
  _id: string;
  _rev?: string;
  archived?: boolean;
  movementNumber?: string;
  correctedQuantity?: number;
  correctedAt?: string;
  voidedAt?: string;
  correctedBy?: string;
  correctionReason?: string;
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

const UNALLOCATED = "__UNALLOCATED__";

/** Only this user-facing inventory view is sanitized; server diagnostics retain database details. */
function stockPublicMessage(value: unknown, fallback: string): string {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : fallback;
  return message.replace(/\b(?:Neon|Sanity)\b/gi, "the system");
}

const actionCopy: Record<InventoryAction, { kicker: string; title: string; help: string; submit: string }> = {
  PURCHASE: {
    kicker: "Procurement",
    title: "Purchase stock from a supplier",
    help: "Purchase Stock records units you have bought as incoming for the selected store. It does not increase sellable on-hand stock until those units are received.",
    submit: "Record purchase",
  },
  RECEIVE: {
    kicker: "Goods receipt",
    title: "Receive or reduce stock at a store/location",
    help: "Choose Receive to add purchased incoming units, or Reduce to subtract existing stock. Reductions leave incoming units unchanged.",
    submit: "Receive stock",
  },
  TRANSFER: {
    kicker: "Inventory transfer",
    title: "Transfer stock between stores",
    help: "Transfers move sellable stock from one store/location to another without changing the company-wide stock total.",
    submit: "Transfer stock",
  },
};

function balanceFor(item: InventoryItem, storeId: string) {
  return item.locationBalances?.find((balance) => balance.storeId === storeId);
}

function inventoryView(item: InventoryItem, storeId: string): InventoryItem {
  if (!storeId || storeId === "All") return item;
  const balance = balanceFor(item, storeId);
  const locationVariants = new Map((balance?.variants || []).map((variant) => [variant.variantId, variant]));
  return {
    ...item,
    location: balance?.storeName || "Selected store",
    onHand: Math.max(0, Number(balance?.onHand || 0)),
    incoming: Math.max(0, Number(balance?.incoming || 0)),
    variants: item.variants?.map((variant) => ({
      ...variant,
      stockQuantity: Math.max(0, Number(locationVariants.get(variant.id)?.onHand || 0)),
    })),
  };
}

function StoreSelect({
  label,
  value,
  onChange,
  locations,
  disabled = false,
  includeUnallocated = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locations: StoreLocation[];
  disabled?: boolean;
  includeUnallocated?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-2 self-start text-xs font-semibold ${wide ? "lg:col-span-6" : "lg:col-span-4"}`}>
      {label}
      <div className="relative min-w-0">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-12 w-full appearance-none rounded-xl border hairline bg-white py-2.5 pl-4 pr-11 font-normal disabled:cursor-not-allowed disabled:opacity-70"
        >
          <option value="">Select store / location</option>
          {includeUnallocated ? <option value={UNALLOCATED}>Existing unallocated stock</option> : null}
          {locations.map((store) => <option key={store._id} value={store._id}>{store.name}{store.code ? ` · ${store.code}` : ""}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
      </div>
    </label>
  );
}

export default function InventoryManagementPage() {
  const { data: session } = useSession();
  const { data, loading, error, refresh } = useLiveOperations("products");
  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "STORE" || role === "MANAGER" || role === "STORE_STAFF";
  const hideProcurement = role === "MANAGER" || role === "STORE_STAFF";
  // DBK-124: Managers may purchase/receive at their assigned branch only.
  // Sales Staff remain read-only; cross-branch transfers stay Admin/Store Manager only.
  const canChangeStock = role === "ADMIN" || role === "STORE" || role === "MANAGER";
  const canTransferStock = role === "ADMIN" || role === "STORE";
  const canCorrectStock = role === "ADMIN" || role === "STORE";
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [location, setLocation] = useState("All");
  const [storeLocations, setStoreLocations] = useState<StoreLocation[]>([]);
  const [assignedStoreId, setAssignedStoreId] = useState("");
  const [action, setAction] = useState<InventoryAction | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [movementProductSearch, setMovementProductSearch] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [variantSearch, setVariantSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  // Mobile number keyboards may not offer a minus key. Keep the quantity magnitude
  // positive and make the movement direction an explicit, accessible choice.
  const [receiveReduction, setReceiveReduction] = useState(false);
  const [sourceStoreId, setSourceStoreId] = useState("");
  const [destinationStoreId, setDestinationStoreId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementQuery, setMovementQuery] = useState("");
  const [movementFrom, setMovementFrom] = useState("");
  const [movementTo, setMovementTo] = useState("");
  const [movementType, setMovementType] = useState("");
  const [movementHasMore, setMovementHasMore] = useState(false);
  const [movementNextOffset, setMovementNextOffset] = useState(0);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);
  const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null);
  const [correctedQuantity, setCorrectedQuantity] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctingMovement, setCorrectingMovement] = useState(false);
  const [voidMovement, setVoidMovement] = useState(false);
  const appliedMovementFilters = useRef<MovementFilters>(EMPTY_MOVEMENT_FILTERS);
  const movementRequestNumber = useRef(0);
  const initiallyLoadedForRole = useRef("");
  const actionSectionRef = useRef<HTMLElement | null>(null);
  const pendingMovement = useRef<{signature:string;operationId:string}|null>(null);

  function openAction(nextAction: InventoryAction, productId?: string) {
    if (!canChangeStock || (nextAction === "TRANSFER" && !canTransferStock)) return;
    pendingMovement.current = null;
    setAction(nextAction);
    setReceiveReduction(false);
    setQuantity("1");
    if (productId) {
      setSelectedProductId(productId);
      setMovementProductSearch("");
    }
    setMessage(null);
    setSelectedVariantId("");
    setVariantSearch("");
    setSourceStoreId("");
    setDestinationStoreId(role === "MANAGER" ? assignedStoreId : "");
    window.requestAnimationFrame(() => actionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function loadMovements(filters = appliedMovementFilters.current, offset = 0) {
    if (!canManage) return;
    const requestNumber = ++movementRequestNumber.current;
    setMovementLoading(true);
    setMovementError(null);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.type) params.set("type", filters.type);
      if (offset) params.set("offset", String(offset));
      const response = await fetch(`/api/backoffice/inventory/movements?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { movements?: InventoryMovement[]; hasMore?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to load stock movements.");
      if (requestNumber !== movementRequestNumber.current) return;
      const nextMovements = payload.movements || [];
      setMovements((previous) => offset ? [...previous, ...nextMovements] : nextMovements);
      setMovementHasMore(Boolean(payload.hasMore));
      setMovementNextOffset(offset + nextMovements.length);
    } catch (cause) {
      if (requestNumber === movementRequestNumber.current) setMovementError(stockPublicMessage(cause, "Unable to load stock movements."));
    } finally {
      if (requestNumber === movementRequestNumber.current) setMovementLoading(false);
    }
  }

  function searchMovements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (movementFrom && movementTo && movementFrom > movementTo) {
      setMovementError("From date must be on or before To date.");
      return;
    }
    const filters = { q: movementQuery.trim(), from: movementFrom, to: movementTo, type: movementType };
    appliedMovementFilters.current = filters;
    void loadMovements(filters);
  }

  async function restoreArchivedMovement(movement: InventoryMovement) {
    if (!canCorrectStock || !movement.archived || correctingMovement) return;
    if (!window.confirm("Restore this historical movement for a reviewed stock correction? This alone does not alter stock quantities.")) return;
    setCorrectingMovement(true);
    setMovementError(null);
    try {
      await fetch("/api/backoffice/inventory/movements", {
        method: "PUT", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({movementId:movement._id}),
      }).then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Restoration failed");
      });
      setMessage("Archived movement restored. Find it in the refreshed history, then select Edit / Void.");
      await loadMovements(appliedMovementFilters.current);
    } catch (cause) {
      setMovementError(stockPublicMessage(cause, "Unable to restore movement."));
    } finally { setCorrectingMovement(false); }
  }

  function beginCorrection(movement: InventoryMovement) {
    if (!canCorrectStock || Number(movement.quantityChange || 0) < 0 || (!movement._rev && !movement._id.startsWith('dbk69.dbk69-'))) return;
    setEditingMovement(movement);
    setCorrectedQuantity(String(movement.correctedQuantity ?? Math.abs(Number(movement.quantityChange || 0))));
    setVoidMovement(false);
    setCorrectionReason("");
    setMovementError(null);
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCorrectStock || !editingMovement || Number(editingMovement.quantityChange || 0) < 0 || (!editingMovement._rev && !editingMovement._id.startsWith('dbk69.dbk69-')) || correctingMovement) return;
    if (voidMovement && !window.confirm("Void this movement? The inventory ledger will be adjusted, and the original record will remain in the audit trail. This cannot be undone as a simple edit.")) return;
    setCorrectingMovement(true);
    setMovementError(null);
    try {
      await mutateBackoffice("/api/backoffice/inventory/movements", {
        movementId: editingMovement._id,
        expectedRevision: editingMovement._rev,
        expectedQuantity: editingMovement.correctedQuantity ?? Math.abs(Number(editingMovement.quantityChange || 0)),
        quantity: voidMovement ? 0 : Number(correctedQuantity),
        voidMovement,
        reason: correctionReason.trim(),
      }, "PATCH");
      setEditingMovement(null);
      await Promise.all([refresh(), loadMovements()]);
      setMessage(voidMovement ? "Movement voided. Stock balances were adjusted and the audit record was retained." : "Stock movement corrected. The original entry and the correction are retained in the audit trail.");
    } catch (cause) {
      setMovementError(stockPublicMessage(cause, "Unable to correct stock movement."));
    } finally {
      setCorrectingMovement(false);
    }
  }

  function clearMovementFilters() {
    setMovementQuery("");
    setMovementFrom("");
    setMovementTo("");
    setMovementType("");
    appliedMovementFilters.current = EMPTY_MOVEMENT_FILTERS;
    void loadMovements(EMPTY_MOVEMENT_FILTERS);
  }

  async function loadStores() {
    if (!canManage) return;
    try {
      const response = await fetch("/api/backoffice/store-locations", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { locations?: StoreLocation[]; assignedStoreId?: string };
      const stores = (payload.locations || []).filter((store) => store.active !== false);
      setStoreLocations(stores);
      setAssignedStoreId(payload.assignedStoreId || "");
      if ((role === "MANAGER" || role === "STORE_STAFF") && payload.assignedStoreId) setLocation(payload.assignedStoreId);
      if (role === "MANAGER" && payload.assignedStoreId) setDestinationStoreId(payload.assignedStoreId);
    } catch {
      // Stock list can still render if store configuration is temporarily unavailable.
    }
  }

  useEffect(() => {
    if (!canManage || !role || initiallyLoadedForRole.current === role) return;
    // One initial fetch per role. React Strict Mode may replay this effect,
    // but product/stock writes still explicitly refresh the live data.
    initiallyLoadedForRole.current = role;
    void Promise.all([loadMovements(), loadStores()]);
  }, [canManage, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const inventory = data?.products || [];
  const filtered = useMemo(() => inventory.map((item) => inventoryView(item, location)).filter((item) => {
    if (stockFilter !== "all" && stockStatus(item) !== stockFilter) return false;
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      if (![item.name, item.sku, item.category, ...(item.variants || []).flatMap((variant) => [variant.title, variant.sku, variant.colour, variant.size])].some((value) => String(value || "").toLowerCase().includes(term))) return false;
    }
    return true;
  }), [inventory, location, search, stockFilter]);

  const movementProductOptions = useMemo(() => inventory.filter((item) =>
    !movementProductSearch.trim() || [item.name, item.sku].some((value) => String(value || "").toLocaleLowerCase().includes(movementProductSearch.trim().toLocaleLowerCase()))
    || item.id === selectedProductId
  ), [inventory, movementProductSearch, selectedProductId]);
  const selectedProductRaw = inventory.find((item) => item.id === selectedProductId);
  const selectedProduct = selectedProductRaw ? inventoryView(selectedProductRaw, role === "MANAGER" && assignedStoreId ? assignedStoreId : "All") : undefined;
  const selectedVariant = selectedProduct?.variants?.find((variant) => variant.id === selectedVariantId);
  const visibleVariants = selectedProductRaw?.variants?.filter((variant) =>
    [variant.title, variant.colour, variant.size, variant.sku].some((value) => String(value || "").toLocaleLowerCase().includes(variantSearch.toLocaleLowerCase().trim()))
  ) || [];
  const destinationBalance = selectedProductRaw && destinationStoreId ? balanceFor(selectedProductRaw, destinationStoreId) : undefined;
  const destinationVariantBalance = destinationBalance?.variants?.find((variant) => variant.variantId === selectedVariantId);
  const requiresVariant = Boolean(selectedProductRaw?.variants?.length);
  const storeOnHandBefore = requiresVariant ? Number(destinationVariantBalance?.onHand || 0) : Number(destinationBalance?.onHand || 0);
  const storeIncomingBefore = requiresVariant ? Number(destinationVariantBalance?.incoming || 0) : Number(destinationBalance?.incoming || 0);
  const stockReduction = action === "RECEIVE" && receiveReduction;
  const signedQuantity = inventoryQuantityFromMagnitude(quantity, stockReduction);
  const quantityIsValid = signedQuantity !== null;
  const enteredQuantity = signedQuantity ?? 0;
  const projectedOnHand = action === "RECEIVE" && quantityIsValid ? storeOnHandBefore + enteredQuantity : storeOnHandBefore;
  const projectedIncoming = action === "PURCHASE" && quantityIsValid ? storeIncomingBefore + enteredQuantity : action === "RECEIVE" && enteredQuantity > 0 && quantityIsValid ? storeIncomingBefore - enteredQuantity : storeIncomingBefore;
  const invalidReduction = stockReduction && quantityIsValid && storeOnHandBefore + enteredQuantity < 0;
  const movementBlocker = !selectedProductId ? "Select a product first."
    : !quantityIsValid ? "Enter a whole-number quantity greater than zero."
    : requiresVariant && !selectedVariantId ? "Select a product variant."
    : !destinationStoreId ? "Select a store or location."
    : invalidReduction ? "The reduction exceeds the stock available at this location."
    : stockReduction && note.trim().length < 5 ? "Enter a reason for the reduction (at least 5 characters) to enable Reduce stock."
    : note.length > 500 ? "The note cannot exceed 500 characters."
    : action === "TRANSFER" && (!sourceStoreId || sourceStoreId === destinationStoreId) ? "Select a different source store."
    : null;
  const selectedSourceBalance = selectedProductRaw && sourceStoreId && sourceStoreId !== UNALLOCATED ? balanceFor(selectedProductRaw, sourceStoreId) : undefined;
  const unallocated = Math.max(0, Number(selectedProductRaw?.unallocatedOnHand || 0));

  async function submitMovement() {
    if (!canChangeStock || !action || !selectedProductId || (requiresVariant && !selectedVariantId)) return;
    if (movementBlocker) {
      setMessage(movementBlocker);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const operation = {
        action,
        productId: selectedProductId,
        variantId: selectedVariantId || undefined,
        quantity: enteredQuantity,
        sourceStoreId: action === "TRANSFER" ? sourceStoreId : undefined,
        destinationStoreId,
        note,
      };
      const signature = JSON.stringify(operation);
      if (pendingMovement.current?.signature !== signature) {
        pendingMovement.current = {signature,operationId:`dbk69-${crypto.randomUUID()}`};
      }
      const payload = (await mutateBackoffice("/api/backoffice/inventory/movements", {
        ...operation,
        operationId:pendingMovement.current.operationId,
      }, "POST")) as { stockAfter?: number; incomingAfter?: number; locationOnHand?: number; locationIncoming?: number };

      if (action === "PURCHASE") setMessage(`Purchase recorded. Store incoming stock: ${payload.locationIncoming ?? "updated"}.`);
      else if (action === "RECEIVE") setMessage(stockReduction ? `Stock reduced (audited). Store on hand: ${payload.locationOnHand ?? "updated"}; incoming unchanged: ${payload.locationIncoming ?? "updated"}.` : `Stock received. Store on hand: ${payload.locationOnHand ?? "updated"}; incoming: ${payload.locationIncoming ?? "updated"}.`);
      else setMessage(`Stock transferred. Destination on hand: ${payload.locationOnHand ?? "updated"}.`);

      pendingMovement.current = null;
      setQuantity("1");
      setReceiveReduction(false);
      setNote("");
      setSelectedProductId("");
      setSelectedVariantId("");
      setSourceStoreId("");
      setDestinationStoreId("");
      await Promise.all([refresh(), loadMovements()]);
    } catch (cause) {
      setMessage(stockPublicMessage(cause, "Unable to update inventory."));
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error ? stockPublicMessage(error, "Unable to load inventory.") : error} onRetry={refresh} /></div>;

  const exportColumns = [
    {key:"name",label:"Product"},{key:"sku",label:"SKU"},{key:"category",label:"Category"},{key:"location",label:"Location"},
    {key:"onHand",label:"On Hand"},{key:"reserved",label:"Reserved"},{key:"available",label:"Available Stock"},{key:"incoming",label:"Incoming"},
    ...(!hideProcurement ? [{key:"unitCost",label:"Procurement Cost"}] : []),
    {key:"price",label:"Retail Price"},
  ];

  // Full report is independent of the on-screen search filter. The authorized
  // overview response has already been store-scoped for Manager / Store Staff.
  const fullInventoryRows = fullInventoryReportRows(inventory, {
    includeCompany: !hideProcurement, hideProcurement,
  });
  const fullInventoryColumns = [
    {key:"level",label:"Row Level (do not sum across levels)"},
    {key:"name",label:"Product"},{key:"sku",label:"SKU"},{key:"category",label:"Category"},
    {key:"variant",label:"Variant"},{key:"location",label:"Location"},
    {key:"onHand",label:"On Hand"},{key:"incoming",label:"Incoming"},
    {key:"reserved",label:"Reserved (company only)"},{key:"unallocated",label:"Unallocated / Review"},
    ...(!hideProcurement ? [{key:"unitCost",label:"Procurement Cost"}] : []),
    {key:"retailPrice",label:"Retail Price"},
  ];

  const movementHeadings = ["Date","Movement","Product / variant","Qty","From / To",...(!hideProcurement ? ["Procurement value"] : []),"Recorded by","Reference / note",...(canCorrectStock ? ["Correct / Void"] : [])];
  const inventoryHeadings = ["Product","SKU","Location","On hand","Reserved","Available","Incoming","Status",...(!hideProcurement ? ["Cost"] : []),"Retail",""];

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker text-[var(--muted)]">Inventory</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Stock control</h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Track stock by client-created store/location, receive purchases into the correct branch, and transfer stock between locations while preserving the company total.</p>
          </div>
          {canChangeStock && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openAction("PURCHASE")} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold !text-soft-cream"><PackagePlus size={14}/>Purchase stock</button>
            <button type="button" onClick={() => openAction("RECEIVE")} className="inline-flex min-h-11 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-xs font-semibold"><ArrowDownToLine size={14}/>Receive stock</button>
            {canTransferStock && <button type="button" onClick={() => openAction("TRANSFER")} className="inline-flex min-h-11 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-xs font-semibold"><Send size={14}/>Transfer stock</button>}
          </div>}
        </div>
      </div>

      {canManage && !hideProcurement && <div className="p-4 pb-0 sm:p-6 sm:pb-0 lg:p-8 lg:pb-0"><InventoryOverviewChart /></div>}

      {canChangeStock && action && (
        <section ref={actionSectionRef} className="scroll-mt-6 mx-4 mt-6 rounded-2xl border hairline bg-[var(--paper)] p-4 sm:mx-6 sm:p-6 lg:mx-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="kicker text-[var(--muted)]">{actionCopy[action].kicker}</p><h2 className="mt-2 text-xl font-semibold">{actionCopy[action].title}</h2></div>
            <div className="flex flex-wrap items-center gap-2"><div className="inline-flex flex-wrap rounded-2xl border hairline bg-[var(--paper-2)] p-1 sm:rounded-full">{((canTransferStock ? ["PURCHASE","RECEIVE","TRANSFER"] : ["PURCHASE","RECEIVE"]) as InventoryAction[]).map((value)=><button key={value} type="button" onClick={()=>openAction(value)} className={`rounded-full px-4 py-2 text-xs font-semibold ${action===value?"bg-[var(--brand-green)] !text-soft-cream":""}`}>{value === "PURCHASE" ? "Purchase stock" : value === "RECEIVE" ? "Receive stock" : "Transfer stock"}</button>)}</div><button type="button" onClick={()=>setAction(null)} className="px-2 py-2 text-xs underline">Cancel</button></div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-12">
            <div className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-12"><span>Product</span><div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="relative min-w-0"><Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/><input value={movementProductSearch} onChange={(event)=>setMovementProductSearch(event.target.value)} placeholder="Search product name or SKU" aria-label="Search stock movement products" className="min-h-11 w-full rounded-xl border hairline bg-white py-2.5 pl-10 pr-4 font-normal" /></div><div className="relative min-w-0"><select value={selectedProductId} aria-label="Select product for stock movement" onChange={(e)=>{setSelectedProductId(e.target.value);setSelectedVariantId("");setVariantSearch("");}} className="min-h-12 w-full appearance-none rounded-xl border hairline bg-white py-2.5 pl-4 pr-11 font-normal"><option value="">{movementProductOptions.length ? "Select product" : "No matching products"}</option>{movementProductOptions.map((item)=><option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></div></div></div>
            {requiresVariant && <div className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-12">
              <label htmlFor="inventory-variant-search">Find variant</label>
              <input id="inventory-variant-search" type="search" value={variantSearch} onChange={(event) => setVariantSearch(event.target.value)} placeholder="Search colour, size or SKU" className="min-h-10 w-full rounded-xl border hairline bg-white px-3 font-normal" />
              <label htmlFor="inventory-variant-select">Variant to {action === "PURCHASE" ? "purchase" : action === "RECEIVE" ? "receive" : "transfer"}</label>
              <div className="relative min-w-0"><select id="inventory-variant-select" value={selectedVariantId} onChange={(event)=>setSelectedVariantId(event.target.value)} className="min-h-12 w-full appearance-none rounded-xl border hairline bg-white py-2.5 pl-4 pr-11 font-normal"><option value="">Select a variant</option>{visibleVariants.map((variant)=><option key={variant.id} value={variant.id}>{variant.title || [variant.colour,variant.size].filter(Boolean).join(" · ") || variant.sku || "Variant"}</option>)}{selectedVariantId && !visibleVariants.some((variant) => variant.id === selectedVariantId) && selectedProductRaw?.variants?.filter((variant) => variant.id === selectedVariantId).map((variant) => <option key={variant.id} value={variant.id}>{variant.title || variant.sku || "Selected variant"}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]"/></div>
              <p className="text-[10px] font-normal leading-4 text-[var(--muted)]">Record a separate quantity for each variant. Stock is tracked per variant at the selected store.</p>
            </div>}
            {action === "RECEIVE" && <div className="grid min-w-0 gap-2 lg:col-span-12">
              <span className="text-xs font-semibold">What do you want to do?</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Stock adjustment direction">
                <button type="button" aria-pressed={!receiveReduction} onClick={() => { setReceiveReduction(false); setMessage(null); }} className={`min-h-12 rounded-xl border px-3 py-2 text-xs font-semibold ${!receiveReduction ? "bg-[var(--brand-green)] !text-soft-cream" : "border-gray-300 bg-white"}`}>+ Receive purchased stock</button>
                <button type="button" aria-pressed={receiveReduction} onClick={() => { setReceiveReduction(true); setMessage(null); }} className={`min-h-12 rounded-xl border px-3 py-2 text-xs font-semibold ${receiveReduction ? "bg-[var(--brand-green)] !text-soft-cream" : "border-gray-300 bg-white"}`}>− Reduce existing stock</button>
              </div>
              <p className="text-[11px] text-[var(--muted)]">On a phone, select <strong>Reduce existing stock</strong>, then enter 32 to subtract 32 units. A minus key is not needed.</p>
            </div>}
            <label className={`flex min-w-0 flex-col gap-2 self-start text-xs font-semibold ${action === "TRANSFER" ? "lg:col-span-4" : "lg:col-span-6"}`}>Quantity of units<input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={quantity} onChange={(e)=>{
              const next = e.target.value.trim();
              if (action === "RECEIVE" && next.startsWith("-")) { setReceiveReduction(true); setQuantity(next.slice(1)); }
              else setQuantity(next);
            }} className="min-h-12 w-full rounded-xl border hairline bg-white px-4 py-2.5 font-normal" aria-describedby={action === "RECEIVE" ? "receive-quantity-help" : undefined}/>
              {action === "RECEIVE" && <span id="receive-quantity-help" className="text-[11px] font-normal text-[var(--muted)]">{stockReduction ? `Reduction: −${quantity || "0"} units` : `Receipt: +${quantity || "0"} units`}</span>}
            </label>
            {(action === "PURCHASE" || action === "RECEIVE") && <StoreSelect label="Store / location" value={destinationStoreId} onChange={setDestinationStoreId} locations={role === "MANAGER" ? storeLocations.filter(store => store._id === assignedStoreId) : storeLocations} disabled={role === "MANAGER"} wide/>}
            {action === "TRANSFER" && <><StoreSelect label="Source store" value={sourceStoreId} onChange={setSourceStoreId} locations={storeLocations} includeUnallocated={(role === "ADMIN" || role === "STORE") && unallocated > 0}/><StoreSelect label="Destination store" value={destinationStoreId} onChange={setDestinationStoreId} locations={storeLocations.filter((store)=>store._id!==sourceStoreId)}/></>}
            <label className="grid min-w-0 gap-2 text-xs font-semibold lg:col-span-12">{stockReduction ? "Reason for reduction (required)" : "Note / reference"}<input value={note} onChange={(e)=>setNote(e.target.value)} maxLength={500} placeholder={stockReduction ? "e.g. Damaged stock correction" : action === "PURCHASE" ? "Supplier, invoice or PO reference" : "Optional reference"} className="min-h-12 w-full rounded-xl border hairline bg-white px-4 py-2.5 font-normal"/>{stockReduction && <span className="text-[11px] font-normal text-[var(--muted)]">Minimum 5 characters. The reason is saved in stock history.</span>}</label>
          </div>

          {(action === "PURCHASE" || action === "RECEIVE") && selectedProductRaw && destinationStoreId && (!requiresVariant || selectedVariantId) && <div className="mt-4 rounded-xl border hairline bg-[var(--paper-2)] p-4 text-xs" role="status" aria-live="polite">
            <p className="font-semibold">{requiresVariant ? "Selected variant" : "Product"} · {storeLocations.find((store) => store._id === destinationStoreId)?.name || "Store"}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p>On hand: <strong>{storeOnHandBefore.toLocaleString("en-KE")} → {Number.isFinite(projectedOnHand) ? projectedOnHand.toLocaleString("en-KE") : "—"}</strong></p>
              <p>Incoming: <strong>{storeIncomingBefore.toLocaleString("en-KE")} → {Number.isFinite(projectedIncoming) ? projectedIncoming.toLocaleString("en-KE") : "—"}</strong></p>
            </div>
            <p className="mt-2 text-[var(--muted)]">{action === "PURCHASE" ? "Purchases increase incoming only. Receiving later moves units from incoming to on-hand." : stockReduction ? "Stock reduction decreases on-hand only. Incoming stays unchanged; the reason is retained in the system audit history." : "Receiving adds to on-hand stock. The system checks purchased incoming units when saving."}</p>
            {stockReduction && invalidReduction && <p className="mt-2 font-semibold text-red-700">This reduction exceeds the displayed on-hand stock. The system checks the latest balance before saving.</p>}
            {action === "RECEIVE" && enteredQuantity > storeIncomingBefore && <div className="mt-2 text-red-700"><p className="font-semibold">Only {storeIncomingBefore.toLocaleString("en-KE")} units are awaiting receipt here. To subtract existing stock instead, select <strong>Reduce existing stock</strong> above; otherwise record the purchase first.</p>{storeIncomingBefore === 0 && canChangeStock && <button type="button" onClick={() => openAction("PURCHASE", selectedProductId)} className="mt-2 rounded-full border border-amber-300 px-3 py-2 text-xs font-semibold text-[var(--ink)]">Record purchase first</button>}</div>}
          </div>}
          {selectedProductRaw && <div className={`mt-4 grid gap-3 rounded-xl border hairline bg-[var(--paper-2)] p-4 sm:grid-cols-2 ${hideProcurement ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Company on hand</p><p className="mt-1 font-semibold">{selectedProductRaw.companyOnHand ?? selectedProductRaw.onHand}</p></div>
            {Number(selectedProductRaw.unclassifiedOnHand||0)>0 && <div className="text-amber-800"><p className="text-[9px] font-semibold uppercase">Awaiting variant allocation</p><p>{selectedProductRaw.unclassifiedOnHand} units · not sellable until allocated in the Admin product editor.</p></div>}
            <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Selected source on hand</p><p className="mt-1 font-semibold">{sourceStoreId === UNALLOCATED ? unallocated : Math.max(0, Number(selectedSourceBalance?.onHand || 0))}</p></div>
            <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Selected variant</p><p className="mt-1 font-semibold">{selectedVariant ? `${selectedVariant.stockQuantity} on hand` : "—"}</p></div>
            {!hideProcurement && <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Movement value</p><p className="mt-1 font-semibold">{formatKes(Number(quantity || 0) * selectedProductRaw.unitCost)}</p></div>}
          </div>}

          {message && <div role="status" aria-live="polite" className="mt-5 rounded-xl border hairline bg-[var(--paper-2)] px-4 py-3 text-xs font-medium">{message}</div>}
          <div className="mt-5 flex flex-col gap-3 border-t hairline pt-5 sm:flex-row sm:items-center sm:justify-between"><div className="max-w-2xl"><p className="text-[10px] leading-relaxed text-[var(--muted)]">{stockReduction ? "This operation reduces existing stock at the selected store without affecting incoming units. A reason is required for the audit trail." : actionCopy[action].help}</p>{movementBlocker && !saving && <p role="alert" className="mt-2 text-xs font-semibold text-amber-800">{movementBlocker}</p>}</div><button type="button" disabled={saving || Boolean(movementBlocker)} onClick={()=>void submitMovement()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-6 text-xs font-semibold !text-soft-cream disabled:cursor-not-allowed disabled:opacity-50">{action === "PURCHASE" ? <PackagePlus size={14}/> : action === "RECEIVE" ? <ArrowDownToLine size={14}/> : <Send size={14}/>} {saving?"Saving…":stockReduction ? "Reduce stock" : actionCopy[action].submit}</button></div>
        </section>
      )}

      <div className={`${action ? "mt-6" : "mt-4"} border-y hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
          <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase text-[var(--muted)] sm:col-span-2 xl:col-span-4">
            Search inventory
            <div className="relative min-w-0">
              <Search size={14} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
              <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by product, SKU, category or variant" aria-label="Search stock inventory products" className="min-h-12 w-full rounded-xl border hairline bg-white py-3 pl-10 pr-4 text-sm font-normal normal-case text-[var(--ink)] outline-none focus:border-[var(--brand-green)]"/>
            </div>
          </label>
          <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase text-[var(--muted)] xl:col-span-2">
            Stock level
            <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as "all" | "low" | "out")} aria-label="Filter inventory by stock level" className="min-h-12 w-full rounded-xl border hairline bg-white px-4 text-xs font-normal normal-case text-[var(--ink)]">
              <option value="all">All stock</option><option value="low">Low stock only</option><option value="out">Out of stock</option>
            </select>
          </label>
          <div className="grid min-w-0 gap-1 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">Results</span>
            <span className="flex min-h-12 items-center text-xs text-[var(--muted)]">{filtered.length} / {inventory.length} inventory products</span>
          </div>
          <label className="grid min-w-0 gap-1 text-[10px] font-semibold uppercase text-[var(--muted)] xl:col-span-2">
            Location
            <div className="relative min-w-0">
              <select value={location} disabled={Boolean(assignedStoreId && (role === "MANAGER" || role === "STORE_STAFF"))} onChange={(e)=>setLocation(e.target.value)} className="min-h-12 w-full appearance-none rounded-xl border hairline bg-white py-3 pl-4 pr-11 text-sm font-normal normal-case text-[var(--ink)] disabled:opacity-70"><option value="All">Company total</option>{storeLocations.map((store)=><option key={store._id} value={store._id}>{store.name}{store.code?` · ${store.code}`:""}</option>)}</select>
              <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
            </div>
          </label>
          <div className="grid min-w-0 gap-1 xl:col-span-2">
            <span className="text-[10px] font-semibold uppercase text-[var(--muted)]">Export</span>
            <details className="relative min-w-0 rounded-xl border hairline bg-white text-xs">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 font-semibold">Export inventory <ChevronDown size={14}/></summary>
              <div className="relative z-10 grid gap-3 border-t hairline bg-white p-4 sm:min-w-[270px]">
                <p className="font-semibold">Current filtered view</p>
                <ExportButtons title="Filtered Inventory" columns={exportColumns} rows={filtered.map((item)=>({name:item.name,sku:item.sku,category:item.category,location:item.location,onHand:item.onHand,reserved:item.reserved,available:availableStock(item),incoming:item.incoming,...(!hideProcurement?{unitCost:item.unitCost}:{}),price:item.retailPrice}))}/>
                <p className="border-t hairline pt-3 font-semibold">Full inventory breakdown</p>
                <p className="text-[10px] text-[var(--muted)]">Independent of the current search and stock filter.</p>
                <ExportButtons title="Full Inventory Breakdown" columns={fullInventoryColumns} rows={fullInventoryRows}/>
              </div>
            </details>
          </div>
        </div>
      </div>

      {canManage && <section className="px-4 pt-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border hairline bg-[var(--paper)]">
          <div className="flex items-center gap-2 border-b hairline px-4 py-4 sm:px-5">
            <History size={15} className="text-[var(--brand-green)]"/>
            <div><h2 className="text-sm font-semibold">Recent stock movements</h2><p className="mt-0.5 text-[10px] text-[var(--muted)]">Search purchase, receipt and transfer history by product, variant, SKU or reference. Dates use Kenya time (EAT).</p></div>
          </div>
          <form onSubmit={searchMovements} className="grid gap-3 border-b hairline px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[minmax(180px,1fr)_minmax(130px,160px)_minmax(130px,160px)_minmax(145px,170px)_auto] lg:items-end">
            <label className="grid gap-1.5 text-xs font-semibold">Search history
              <span className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"/>
                <input type="search" value={movementQuery} onChange={(event) => setMovementQuery(event.target.value)} placeholder="Product, variant, SKU, reference" maxLength={120} className="min-h-11 w-full rounded-xl border hairline bg-white pl-9 pr-3 text-sm font-normal"/>
              </span>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">From date
              <input type="date" value={movementFrom} max={movementTo || undefined} onChange={(event) => setMovementFrom(event.target.value)} className="min-h-11 min-w-0 w-full rounded-xl border hairline bg-white px-3 text-sm font-normal"/>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">To date
              <input type="date" value={movementTo} min={movementFrom || undefined} onChange={(event) => setMovementTo(event.target.value)} className="min-h-11 min-w-0 w-full rounded-xl border hairline bg-white px-3 text-sm font-normal"/>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold">Movement
              <select value={movementType} onChange={(event) => setMovementType(event.target.value)} className="min-h-11 w-full rounded-xl border hairline bg-white px-3 text-sm font-normal">
                <option value="">All movements</option><option value="PURCHASE">Purchase stock</option><option value="RECEIPT">Receive stock</option><option value="TRANSFER">Transfer stock</option>
              </select>
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
              <button type="submit" disabled={movementLoading} className="min-h-11 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold !text-soft-cream disabled:opacity-60">Search</button>
              <button type="button" onClick={clearMovementFilters} className="min-h-11 rounded-full border hairline px-4 text-xs font-semibold">Clear</button>
            </div>
          </form>
          {movementError && <p role="alert" className="px-4 py-3 text-xs text-red-700 sm:px-5">{movementError}</p>}
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead><tr className="border-b hairline">{movementHeadings.map((heading) => <th key={heading} scope="col" className="sticky top-0 z-10 bg-[var(--paper)] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] shadow-[0_1px_0_var(--muted)]">{heading}</th>)}</tr></thead>
              <tbody>{movements.map((movement) => {
                const label = movement.movementType === "PURCHASE" ? "Purchase stock" : movement.movementType === "RECEIPT" ? "Receive stock" : "Transfer stock";
                const route = movement.movementType === "PURCHASE" ? `Supplier → ${movement.destination || "Store"}` : movement.movementType === "RECEIPT" ? `${Number(movement.quantityChange || 0) < 0 ? "Stock correction" : "Incoming"} → ${movement.destination || "Store"}` : `${movement.sourceLocation || "Store"} → ${movement.destination || "Store"}`;
                return <tr key={movement._id} className="border-b hairline last:border-0"><td className="whitespace-nowrap px-4 py-3 text-xs">{movement.createdAt ? new Date(movement.createdAt).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—"}</td><td className="px-4 py-3 text-xs font-semibold">{label}</td><td className="px-4 py-3 text-xs">{movement.productName || "Product"}{movement.variantLabel ? <><br/><span className="text-[10px] text-[var(--muted)]">{movement.variantLabel}</span></> : null}</td><td className="whitespace-nowrap px-4 py-3 text-xs font-semibold tabular-nums">{movement.movementType === "TRANSFER" || Number(movement.quantityChange || 0) < 0 ? "−" : "+"}{Math.abs(movement.correctedQuantity ?? Number(movement.quantityChange || 0)).toLocaleString("en-KE")}{movement.correctedAt && <span className="mt-1 block text-[9px] text-amber-700">{movement.voidedAt ? "Voided" : "Corrected"}</span>}</td><td className="px-4 py-3 text-xs text-[var(--muted)]">{route}</td>{!hideProcurement && <td className="px-4 py-3 text-xs">{formatKes(Number(movement.movementValue || 0))}</td>}<td className="px-4 py-3 text-xs">{movement.actorName || "—"}</td><td className="px-4 py-3 text-[10px] text-[var(--muted)]"><span className="font-semibold text-[var(--ink)]">{movement.movementNumber || "—"}</span>{movement.note ? <><br/>{movement.note}</> : null}{movement.correctionReason ? <><br/><span className="text-amber-700">Correction by {movement.correctedBy || "staff"}: {movement.correctionReason}</span></> : null}</td>{canCorrectStock && <td className="px-4 py-3 text-xs"><button type="button" disabled={Number(movement.quantityChange || 0) < 0 || (!movement.archived && !movement._rev && !movement._id.startsWith('dbk69.dbk69-')) || correctingMovement || Boolean(movement.voidedAt) || movement.correctedQuantity === 0} onClick={() => movement.archived ? void restoreArchivedMovement(movement) : beginCorrection(movement)} className="inline-flex items-center gap-1 rounded-full border hairline px-3 py-2 font-semibold disabled:opacity-50"><Pencil size={12}/> {Number(movement.quantityChange || 0) < 0 ? "Audited reduction" : movement.voidedAt || movement.correctedQuantity === 0 ? "Voided" : movement.archived ? "Restore to edit" : "Edit / Void"}</button></td>}</tr>;
              })}</tbody>
            </table>
            {!movementLoading && !movementError && movements.length === 0 && <p className="p-8 text-center text-xs text-[var(--muted)]">No stock movements match the selected filters.</p>}
          </div>
          {canCorrectStock && editingMovement && <form onSubmit={(event) => void submitCorrection(event)} className="mx-4 my-4 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:mx-5" aria-label="Correct stock movement">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold">Correct recorded stock movement</h3><p className="mt-1 text-xs text-[var(--muted)]">{editingMovement.movementNumber || editingMovement._id} · {editingMovement.productName} · {editingMovement.variantLabel || "No variant"}</p></div>
              <button type="button" onClick={() => setEditingMovement(null)} disabled={correctingMovement} className="rounded-full border px-3 py-2 text-xs">Cancel</button>
            </div>
            <p className="mt-3 text-xs leading-5">Edit changes the quantity. Void safely reverses the remaining effect of the movement, without deleting its audit history. Product, variant and stores cannot be changed. Corrections that would make stock or incoming negative are rejected.</p>
            <label className="mt-3 flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={voidMovement} onChange={(event) => setVoidMovement(event.target.checked)} /> Void this movement instead of editing its quantity</label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold">Correct quantity<input required={!voidMovement} disabled={voidMovement} type="number" min="1" step="1" value={voidMovement ? "0" : correctedQuantity} onChange={(event) => setCorrectedQuantity(event.target.value)} className="min-h-11 rounded-lg border bg-white px-3 font-normal disabled:opacity-60" /></label>
              <label className="grid gap-1 text-xs font-semibold">Reason for correction<input required minLength={5} maxLength={500} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="e.g. Supplier delivery note had the wrong count" className="min-h-11 rounded-lg border bg-white px-3 font-normal" /></label>
            </div>
            <button type="submit" disabled={correctingMovement || (!voidMovement && (!Number.isSafeInteger(Number(correctedQuantity)) || Number(correctedQuantity) < 1)) || correctionReason.trim().length < 5} className="mt-3 rounded-full bg-[var(--brand-green)] px-4 py-3 text-xs font-semibold !text-white disabled:opacity-50">{correctingMovement ? "Saving…" : voidMovement ? "Void movement (audited)" : "Save audited correction"}</button>
          </form>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline px-4 py-3 sm:px-5">
            <span className="text-xs text-[var(--muted)]">{movementLoading ? "Loading stock movements…" : `${movements.length} movement${movements.length === 1 ? "" : "s"} shown`}</span>
            {movementHasMore && <button type="button" disabled={movementLoading} onClick={() => void loadMovements(appliedMovementFilters.current, movementNextOffset)} className="rounded-full border hairline px-4 py-2 text-xs font-semibold disabled:opacity-50">Load more</button>}
          </div>
        </div>
      </section>}

      <section className="p-4 sm:p-6 lg:p-8">{filtered.length ? <div className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]"><div className="max-h-[75vh] max-w-full overflow-auto overscroll-contain" role="region" aria-label="Inventory products, scroll to view more rows"><table className="w-full min-w-[1000px] text-left"><thead><tr className="border-b hairline">{inventoryHeadings.map((heading)=><th key={heading} scope="col" className="sticky top-0 z-20 bg-[var(--paper)] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] shadow-[0_1px_0_var(--muted)]">{heading}</th>)}</tr></thead><tbody>{filtered.map((item)=><tr key={item.id} className="border-b hairline last:border-0"><td className="px-4 py-4 text-sm font-semibold">{item.name}{item.variants?.length?<span className="ml-2 text-[9px] font-normal text-[var(--muted)]">{item.variants.length} variants</span>:null}</td><td className="px-4 py-4 text-xs">{item.sku}</td><td className="px-4 py-4 text-xs text-[var(--muted)]">{item.location}</td><td className="px-4 py-4 text-xs font-semibold">{item.onHand}</td><td className="px-4 py-4 text-xs">{item.reserved}</td><td className="px-4 py-4 text-xs font-semibold">{availableStock(item)}</td><td className="px-4 py-4 text-xs">{item.incoming}</td><td className="px-4 py-4"><StatusPill value={stockStatus(item)}/></td>{!hideProcurement&&<td className="px-4 py-4 text-xs">{formatKes(item.unitCost)}</td>}<td className="px-4 py-4 text-xs font-semibold">{formatKes(item.retailPrice)}</td><td className="px-4 py-4 text-right"><div className="flex items-center justify-end gap-2">{canCorrectStock && <button type="button" onClick={() => openAction("PURCHASE", item.id)} className="min-h-9 rounded-full border hairline px-3 text-[10px] font-semibold hover:border-[var(--brand-green)]" aria-label={`Purchase additional stock for ${item.name}`}>+ Stock</button>}<Link href={`/shop/${item.slug||""}`} className="group inline-grid size-9 place-items-center rounded-full border hairline hover:border-[var(--brand-green)]" aria-label={`Open ${item.name} in shop`}><ArrowUpRight size={14}/></Link></div></td></tr>)}</tbody></table></div></div> : <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center"><Boxes size={32} className="mx-auto text-[var(--muted)]"/><p className="mt-4 text-sm font-medium">No matching inventory found</p></div>}</section>
    </div>
  );
}
