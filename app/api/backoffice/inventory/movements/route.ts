import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import {
  adjustLocationBalance,
  allocatedIncoming,
  allocatedOnHand,
  findLocationBalance,
  locationIncoming,
  locationOnHand,
  type LocationBalance,
  type StoreRefSnapshot,
} from "@/lib/inventory/location-stock";
import { effectiveOnHand, hasVariants, variantLabel, variantStockTotal, type StockVariant } from "@/lib/inventory/stock";
import { serverClient } from "@/sanity/lib/serverClient";
import { dbk69ApplyAdminOperation, dbk69InventoryEnabled, dbk69ListMovements } from "@/lib/db/dbk69-inventory-neon";
import { dbk83ArchiveReadsEnabled, dbk83ListArchivedMovements, dbk83GetVerifiedRestorableMovement } from "@/lib/db/dbk83-movement-archive";
import { mergeMovementHistory, movementQueryPattern } from "@/lib/inventory/dbk83-history-core";

export const dynamic = "force-dynamic";

const UNALLOCATED = "__UNALLOCATED__";

type ProductRow = {
  _id: string;
  _rev: string;
  name?: string;
  sku?: string;
  initialStock?: number;
  variants?: StockVariant[];
  procurementCost?: number;
  inventory?: {
    _id?: string;
    _rev?: string;
    location?: string;
    incoming?: number;
    unitCost?: number;
    locationBalances?: LocationBalance[];
  } | null;
};

type StoreRow = StoreRefSnapshot & { active?: boolean };

function inventoryDocumentId(productId: string) {
  return `inventory.${productId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function movementNumber() {
  const now = new Date();
  return `DBK-INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function updateVariantOnHand(variants: StockVariant[], variantId: string, quantityChange: number) {
  return variants.map((variant) => variant._key === variantId
    ? { ...variant, stockQuantity: Math.max(0, Number(variant.stockQuantity || 0) + quantityChange) }
    : variant);
}

async function getStore(storeId: string): Promise<StoreRow | null> {
  if (!storeId || storeId === UNALLOCATED) return null;
  return serverClient.fetch<StoreRow | null>(
    `*[_type == "storeLocation" && _id == $storeId && active != false][0]{"id":_id,name,code,"active":coalesce(active,true)}`,
    { storeId },
    { cache: "no-store" },
  );
}

function requireAssignedStore(staff: { role: string; storeLocationId?: string }, requestedStoreId: string, label: string) {
  if (staff.role !== "MANAGER") return;
  if (!staff.storeLocationId) throw new Error("This Manager is not assigned to a store/location. Ask Admin to assign one under Staff.");
  if (requestedStoreId !== staff.storeLocationId) throw new Error(`Managers can only ${label} stock for their assigned store.`);
}

const MOVEMENT_PAGE_SIZE = 50;

function dateToUtc(date: string): string | null {
  // Inventory dates are interpreted as Kenya calendar days (UTC+03:00).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject impossible dates such as February 30 instead of normalizing them.
  const kenyaCalendarDate = new Date(parsed.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return kenyaCalendarDate === date ? parsed.toISOString() : null;
}

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const fromDate = searchParams.get("from") || "";
  const toDate = searchParams.get("to") || "";
  const movementType = searchParams.get("type") || "";
  const offsetParam = searchParams.get("offset") || "0";
  const offset = Number(offsetParam);

  if (query.length > 120) return NextResponse.json({ message: "Search must be 120 characters or fewer." }, { status: 400 });
  if (movementType && !["PURCHASE", "RECEIPT", "TRANSFER"].includes(movementType)) {
    return NextResponse.json({ message: "Invalid movement type." }, { status: 400 });
  }
  if (!/^\d+$/.test(offsetParam) || !Number.isSafeInteger(offset) || offset > 10000) {
    return NextResponse.json({ message: "Invalid movement page." }, { status: 400 });
  }
  const from = fromDate ? dateToUtc(fromDate) : null;
  const toStart = toDate ? dateToUtc(toDate) : null;
  if ((fromDate && !from) || (toDate && !toStart) || (from && toStart && from > toStart)) {
    return NextResponse.json({ message: "Select a valid date range, with From before or equal to To." }, { status: 400 });
  }
  const to = toStart ? new Date(new Date(toStart).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
  // Parameterized full-history filtering is performed before paging, so searches
  // can find movements older than the first 50/150 records.
  const terms = query.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  const needle = terms.length ? `*${terms.join("*")}*` : "";
  const scope = staff.role === "MANAGER" ? staff.storeLocationId || "__NONE__" : "";
  const neon = dbk69InventoryEnabled();
  // Fetch enough from each source to page the merged chronological history.
  const archiveEnabled = dbk83ArchiveReadsEnabled();
  const movementStart = neon || archiveEnabled ? 0 : offset;
  const movementEnd = offset + MOVEMENT_PAGE_SIZE + 1;
  const movements = await serverClient.fetch<Array<Record<string, unknown>>>(
    `*[
      _type == "inventoryMovement" &&
      movementType in ["PURCHASE", "RECEIPT", "TRANSFER"] &&
      ($scope == "" || sourceStore._ref == $scope || destinationStore._ref == $scope) &&
      ($type == "" || movementType == $type) &&
      ($from == "" || createdAt >= $from) &&
      ($to == "" || createdAt < $to) &&
      ($needle == "" || lower(coalesce(productName, "")) match $needle || lower(coalesce(variantLabel, "")) match $needle ||
        lower(coalesce(movementNumber, "")) match $needle || lower(coalesce(note, "")) match $needle ||
        lower(coalesce(actorName, "")) match $needle || lower(coalesce(product->sku, "")) match $needle)
    ] | order(createdAt desc, _id desc)[${movementStart}...${movementEnd}]{
      _id,_rev,movementNumber,movementType,productName,variantId,variantLabel,quantityChange,correctedQuantity,correctedAt,correctedBy,correctionReason,voidedAt,voidedBy,stockBefore,stockAfter,
      incomingBefore,incomingAfter,sourceLocation,destination,"sourceStoreId":sourceStore._ref,"destinationStoreId":destinationStore._ref,
      unitCost,"movementValue":coalesce(correctedMovementValue,movementValue),actorName,note,createdAt
    }`,
    { scope, type: movementType, from: from || "", to: to || "", needle },
    { cache: "no-store" },
  );

  const [neonRows, skuProducts] = await Promise.all([
    neon ? dbk69ListMovements({q:query,from:from || '',to:to || '',type:movementType,scope,limit:movementEnd}) : Promise.resolve([]),
    archiveEnabled && needle ? serverClient.fetch<Array<{_id:string}>>(
      `*[_type == "product" && lower(coalesce(sku, "")) match $needle]{_id}`,
      {needle}, {cache:"no-store"},
    ) : Promise.resolve([]),
  ]);
  const archiveRows = archiveEnabled ? await dbk83ListArchivedMovements({
    pattern: movementQueryPattern(query), from:from || "", to:to || "", type:movementType,
    scope, skuProductIds:skuProducts.map(p=>p._id), limit:movementEnd,
  }) : [];
  const result = neon || archiveEnabled
    ? mergeMovementHistory(movements as Array<{_id:string;createdAt?:string}>, archiveRows, neonRows as Array<{_id:string;createdAt?:string}>, offset, MOVEMENT_PAGE_SIZE)
    : { movements, hasMore: movements.length > MOVEMENT_PAGE_SIZE };
  const hideCost = staff.role === "MANAGER" || staff.role === "STORE_STAFF";
  const page = result.movements;
  return NextResponse.json({
    movements: hideCost ? page.map(({ unitCost: _unitCost, movementValue: _movementValue, ...movement }) => movement) : page,
    hasMore: result.hasMore,
  });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  if (staff.role === "MANAGER") {
    return NextResponse.json({ message: "Managers can view inventory but cannot purchase, receive or transfer stock." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action?: "PURCHASE" | "RECEIVE" | "TRANSFER";
      productId?: string;
      variantId?: string;
      quantity?: number;
      sourceStoreId?: string;
      destinationStoreId?: string;
      note?: string;
      operationId?: string;
    };
    const action = body.action;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
    const quantity = Number(body.quantity);
    const sourceStoreId = typeof body.sourceStoreId === "string" ? body.sourceStoreId.trim() : "";
    const destinationStoreId = typeof body.destinationStoreId === "string" ? body.destinationStoreId.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!productId) return NextResponse.json({ message: "Select a product." }, { status: 400 });
    if (!action || !["PURCHASE", "RECEIVE", "TRANSFER"].includes(action)) return NextResponse.json({ message: "Choose Purchase stock, Receive stock or Transfer stock." }, { status: 400 });
    if (!Number.isSafeInteger(quantity) || quantity < 1) return NextResponse.json({ message: "Quantity must be a positive whole number." }, { status: 400 });
    if ((action === "PURCHASE" || action === "RECEIVE") && !destinationStoreId) return NextResponse.json({ message: "Select the store/location for this stock." }, { status: 400 });
    if (action === "TRANSFER" && (!sourceStoreId || !destinationStoreId || sourceStoreId === destinationStoreId)) return NextResponse.json({ message: "Select different source and destination stores." }, { status: 400 });

    if (action === "PURCHASE" || action === "RECEIVE") requireAssignedStore(staff, destinationStoreId, action === "PURCHASE" ? "purchase" : "receive");
    if (action === "TRANSFER") {
      if (sourceStoreId === UNALLOCATED && !["ADMIN", "STORE"].includes(staff.role)) throw new Error("Only Admin or Store Manager can allocate existing unassigned stock to a branch.");
      if (sourceStoreId !== UNALLOCATED) requireAssignedStore(staff, sourceStoreId, "transfer");
    }

    const [destinationStore, sourceStore, product] = await Promise.all([
      getStore(destinationStoreId),
      sourceStoreId && sourceStoreId !== UNALLOCATED ? getStore(sourceStoreId) : Promise.resolve(null),
      serverClient.fetch<ProductRow | null>(
        `*[_type == "product" && _id == $productId][0]{
          _id,_rev,name,sku,initialStock,procurementCost,variants,
          "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{
            _id,_rev,location,incoming,unitCost,
            "locationBalances": locationBalances[]{_key,store,"storeId":coalesce(store._ref,storeId),"storeName":coalesce(store->name,storeName),"storeCode":coalesce(store->code,storeCode),onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}
          }
        }`,
        { productId },
        { cache: "no-store" },
      ),
    ]);
    if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
    if (!destinationStore) return NextResponse.json({ message: "Destination store is not active or does not exist." }, { status: 400 });
    if (sourceStoreId && sourceStoreId !== UNALLOCATED && !sourceStore) return NextResponse.json({ message: "Source store is not active or does not exist." }, { status: 400 });

    const variantProduct = hasVariants(product.variants);
    const selectedVariant = variantProduct ? product.variants?.find((variant) => variant._key === variantId) : undefined;
    if (variantProduct && !selectedVariant) return NextResponse.json({ message: "Select a product variant so branch stock stays accurate." }, { status: 400 });

    if (dbk69InventoryEnabled()) {
      const operationId = typeof body.operationId === 'string' ? body.operationId : '';
      if (!/^dbk69-[0-9a-f-]{36}$/i.test(operationId)) {
        return NextResponse.json({message:'Reload the inventory form and try again with a unique operation ID.'},{status:400});
      }
      // Stock availability, incoming quantities and idempotency are checked by
      // PostgreSQL, NOT by the stale Sanity inventory snapshot.
      const unitCost = Math.max(0, Number(product.inventory?.unitCost ?? product.procurementCost ?? 0));
      const result = await dbk69ApplyAdminOperation({
        operationId,type:action,productId,variantId:selectedVariant?._key,
        quantity,sourceStoreId:action==='TRANSFER' ? sourceStoreId : undefined,
        destinationStoreId,actorId:staff.customerId,actorName:staff.customerName,
        productName:product.name || 'Product',variantLabel:selectedVariant ? variantLabel(selectedVariant) : undefined,
        destinationName:destinationStore.name,sourceName:sourceStore?.name || (sourceStoreId===UNALLOCATED ? 'Unallocated stock' : ''),
        note,unitCost,
      });
      return NextResponse.json({ok:true,...result});
    }

    const balances = product.inventory?.locationBalances || [];
    const companyBefore = effectiveOnHand(product.initialStock, product.variants);
    const aggregateIncomingBefore = Math.max(0, Number(product.inventory?.incoming || 0));
    const legacyIncoming = Math.max(0, aggregateIncomingBefore - allocatedIncoming(balances));
    const destinationBefore = findLocationBalance(balances, destinationStore.id);
    const sourceBefore = sourceStore ? findLocationBalance(balances, sourceStore.id) : undefined;
    const variantKey = selectedVariant?._key;
    const variantName = selectedVariant ? variantLabel(selectedVariant) : undefined;

    const availableAtSource = sourceStoreId === UNALLOCATED
      ? Math.max(0, (variantKey ? Number(selectedVariant?.stockQuantity || 0) : companyBefore) - allocatedOnHand(balances, variantKey))
      : locationOnHand(sourceBefore, variantKey);
    const incomingAtDestination = locationIncoming(destinationBefore, variantKey);

    if (action === "RECEIVE" && quantity > incomingAtDestination) return NextResponse.json({ message: `Only ${incomingAtDestination} purchased unit${incomingAtDestination === 1 ? " is" : "s are"} awaiting receipt at ${destinationStore.name}${variantName ? ` for ${variantName}` : ""}.` }, { status: 409 });
    if (action === "TRANSFER" && quantity > availableAtSource) return NextResponse.json({ message: `Only ${availableAtSource} unit${availableAtSource === 1 ? " is" : "s are"} available at the selected source${variantName ? ` for ${variantName}` : ""}.` }, { status: 409 });

    let nextBalances = balances;
    let nextVariants = product.variants;
    let companyAfter = companyBefore;

    if (action === "PURCHASE") {
      nextBalances = adjustLocationBalance(nextBalances, destinationStore, { incomingDelta: quantity, variantId: variantKey, variantLabel: variantName });
    } else if (action === "RECEIVE") {
      nextBalances = adjustLocationBalance(nextBalances, destinationStore, { incomingDelta: -quantity, onHandDelta: quantity, variantId: variantKey, variantLabel: variantName });
      if (variantKey && product.variants) {
        nextVariants = updateVariantOnHand(product.variants, variantKey, quantity);
        companyAfter = variantStockTotal(nextVariants);
      } else {
        companyAfter = companyBefore + quantity;
      }
    } else if (action === "TRANSFER") {
      if (sourceStoreId !== UNALLOCATED && sourceStore) nextBalances = adjustLocationBalance(nextBalances, sourceStore, { onHandDelta: -quantity, variantId: variantKey, variantLabel: variantName });
      nextBalances = adjustLocationBalance(nextBalances, destinationStore, { onHandDelta: quantity, variantId: variantKey, variantLabel: variantName });
    }

    const allocatedIncomingAfter = allocatedIncoming(nextBalances);
    const incomingAfter = legacyIncoming + allocatedIncomingAfter;
    const unitCost = Math.max(0, Number(product.inventory?.unitCost ?? product.procurementCost ?? 0));
    const inventoryId = product.inventory?._id || inventoryDocumentId(productId);
    const now = new Date().toISOString();
    const transaction = serverClient.transaction();

    if (action === "RECEIVE") {
      transaction.patch(productId, (patch) => patch.ifRevisionId(product._rev).set({
        initialStock: companyAfter,
        ...(nextVariants ? { variants: nextVariants } : {}),
        available: companyAfter > 0,
      }));
    }

    transaction.createIfNotExists({
      _id: inventoryId,
      _type: "inventoryRecord",
      product: { _type: "reference", _ref: productId },
      location: "Multi-location",
      locationBalances: [],
      reserved: 0,
      incoming: 0,
      incomingByVariant: [],
      reorderPoint: 5,
      unitCost,
    });
    transaction.patch(inventoryId, (patch) => {
      const current = product.inventory?._rev ? patch.ifRevisionId(product.inventory._rev) : patch;
      return current.set({ location: "Multi-location", locationBalances: nextBalances, incoming: incomingAfter });
    });

    const sourceName = action === "PURCHASE" ? "Supplier / purchase" : action === "RECEIVE" ? "Incoming stock" : sourceStoreId === UNALLOCATED ? "Unallocated legacy stock" : sourceStore?.name || "Store";
    const movementId = `inventoryMovement.${randomUUID().replaceAll("-", "")}`;
    transaction.create({
      _id: movementId,
      _type: "inventoryMovement",
      movementNumber: movementNumber(),
      movementType: action === "PURCHASE" ? "PURCHASE" : action === "RECEIVE" ? "RECEIPT" : "TRANSFER",
      product: { _type: "reference", _ref: productId },
      productId,
      productName: product.name || "Product",
      ...(selectedVariant ? { variantId: variantKey, variantLabel: variantName } : {}),
      quantityChange: action === "TRANSFER" ? -quantity : quantity,
      stockBefore: companyBefore,
      stockAfter: companyAfter,
      incomingBefore: aggregateIncomingBefore,
      incomingAfter,
      sourceLocation: sourceName,
      destination: destinationStore.name,
      ...(sourceStore ? { sourceStore: { _type: "reference", _ref: sourceStore.id } } : {}),
      destinationStore: { _type: "reference", _ref: destinationStore.id },
      unitCost,
      movementValue: unitCost * quantity,
      actor: { _type: "reference", _ref: staff.customerId },
      actorName: staff.customerName,
      actorRole: staff.role,
      note: note || undefined,
      createdAt: now,
    });

    await transaction.commit();
    return NextResponse.json({
      ok: true,
      stockBefore: companyBefore,
      stockAfter: companyAfter,
      incomingBefore: aggregateIncomingBefore,
      incomingAfter,
      locationOnHand: locationOnHand(findLocationBalance(nextBalances, destinationStore.id), variantKey),
      locationIncoming: locationIncoming(findLocationBalance(nextBalances, destinationStore.id), variantKey),
      movementId,
    });
  } catch (cause) {
    console.error("Inventory movement failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update inventory." }, { status: 500 });
  }
}


// Correct historical stock quantities without rewriting the original movement.
// The original quantity remains on the movement; every correction has an immutable
// companion audit document and a revision-protected atomic ledger adjustment.
export async function PATCH(request: Request) {
  if (dbk69InventoryEnabled()) {
    return NextResponse.json({message:'Historical movement corrections are blocked during Neon cutover. Use a reviewed ledger adjustment.'},{status:409});
  }
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Only Admin and Store Manager can correct stock movements." }, { status: staff.status });

  let input: { movementId?: string; expectedRevision?: string; quantity?: unknown; reason?: string; voidMovement?: boolean };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid correction request." }, { status: 400 });
  }
  const movementId = typeof input?.movementId === "string" ? input.movementId.trim() : "";
  const revision = typeof input?.expectedRevision === "string" ? input.expectedRevision : "";
  const newQuantity = Number(input?.quantity);
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  const isVoid = input?.voidMovement === true;
  if (!movementId.startsWith("inventoryMovement.") || !revision) return NextResponse.json({ message: "Reload the movement and try again." }, { status: 400 });
  if (!Number.isSafeInteger(newQuantity) || (isVoid ? newQuantity !== 0 : newQuantity < 1)) return NextResponse.json({ message: isVoid ? "Voiding requires a zero quantity." : "Corrected quantity must be a positive whole number." }, { status: 400 });
  if (reason.length < 5 || reason.length > 500) return NextResponse.json({ message: "Enter a reason for this correction (5–500 characters)." }, { status: 400 });

  try {
    type EditableMovement = {
      _id: string; _rev: string; movementType: "PURCHASE" | "RECEIPT" | "TRANSFER";
      productId?: string; product?: { _ref?: string }; variantId?: string; variantLabel?: string;
      sourceStore?: { _ref?: string }; destinationStore?: { _ref?: string };
      sourceLocation?: string; quantityChange?: number; correctedQuantity?: number;
      unitCost?: number; movementNumber?: string; voidedAt?: string;
    };
    const original = await serverClient.fetch<EditableMovement | null>(
      `*[_type == "inventoryMovement" && _id == $movementId][0]{_id,_rev,movementType,productId,product,variantId,variantLabel,sourceStore,destinationStore,sourceLocation,quantityChange,correctedQuantity,unitCost,movementNumber,voidedAt}`,
      { movementId }, { cache: "no-store" },
    );
    if (!original || !["PURCHASE", "RECEIPT", "TRANSFER"].includes(original.movementType)) return NextResponse.json({ message: "Stock movement not found." }, { status: 404 });
    if (original._rev !== revision) return NextResponse.json({ message: "This movement has already changed. Reload before editing." }, { status: 409 });
    if (original.voidedAt) return NextResponse.json({ message: "This movement has already been voided." }, { status: 409 });
    const oldQuantity = original.correctedQuantity ?? Math.abs(Number(original.quantityChange || 0));
    if (!Number.isSafeInteger(oldQuantity) || oldQuantity < 1) return NextResponse.json({ message: "This historical movement cannot be safely corrected automatically." }, { status: 409 });
    if (oldQuantity === newQuantity) return NextResponse.json({ message: "Quantity is unchanged. Enter a different quantity to record a correction." }, { status: 400 });
    const delta = newQuantity - oldQuantity;
    const productId = original.product?._ref || original.productId || "";
    const destinationId = original.destinationStore?._ref || "";
    const sourceId = original.sourceStore?._ref || "";
    const fromUnallocated = original.movementType === "TRANSFER" && !sourceId && original.sourceLocation === "Unallocated legacy stock";
    if (!productId || !destinationId || (original.movementType === "TRANSFER" && !sourceId && !fromUnallocated)) {
      return NextResponse.json({ message: "This movement has incomplete store references. Contact Admin for a reviewed correction." }, { status: 409 });
    }
    const [product, destination, source] = await Promise.all([
      serverClient.fetch<ProductRow | null>(
        `*[_type == "product" && _id == $productId][0]{_id,_rev,name,sku,initialStock,variants,"inventory":*[_type == "inventoryRecord" && product._ref == ^._id][0]{_id,_rev,incoming,locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}}}`,
        { productId }, { cache: "no-store" },
      ),
      getStore(destinationId),
      sourceId ? getStore(sourceId) : Promise.resolve(null),
    ]);
    if (!product || !product.inventory?._id || !product.inventory._rev || !destination) return NextResponse.json({ message: "Product or inventory store is missing. Correction was not applied." }, { status: 409 });
    if (sourceId && !source) return NextResponse.json({ message: "Source store is unavailable. Correction was not applied." }, { status: 409 });
    const variants = product.variants || [];
    const variantId = original.variantId || undefined;
    const variant = variantId ? variants.find((entry) => entry._key === variantId) : undefined;
    if ((hasVariants(variants) && !variant) || (!hasVariants(variants) && variantId)) {
      return NextResponse.json({ message: "Product variants have changed since this movement. A reviewed correction is required." }, { status: 409 });
    }
    const balances = product.inventory.locationBalances || [];
    const dest = findLocationBalance(balances, destinationId);
    const src = sourceId ? findLocationBalance(balances, sourceId) : undefined;
    const hasEnough = (current: number, reduction: number, label: string) =>
      reduction <= 0 || current >= reduction ? null : `${label}: only ${current} units remain; correction requires ${reduction}.`;

    let error: string | null = null;
    if (original.movementType === "PURCHASE") {
      error = hasEnough(locationIncoming(dest, variantId), -delta, "Incoming stock");
    } else if (original.movementType === "RECEIPT") {
      error = delta > 0
        ? hasEnough(locationIncoming(dest, variantId), delta, "Incoming stock")
        : hasEnough(locationOnHand(dest, variantId), -delta, "On-hand stock");
    } else {
      if (delta > 0) {
        const company = effectiveOnHand(product.initialStock, product.variants);
        const unallocated = Math.max(0, (variantId ? Number(variant?.stockQuantity || 0) : company) - allocatedOnHand(balances, variantId));
        error = fromUnallocated ? hasEnough(unallocated, delta, "Unallocated source stock") : hasEnough(locationOnHand(src, variantId), delta, "Source stock");
      } else {
        error = hasEnough(locationOnHand(dest, variantId), -delta, "Destination stock");
      }
    }
    if (error) return NextResponse.json({ message: error }, { status: 409 });

    let nextBalances = balances;
    let nextVariants = product.variants;
    let companyAfter = effectiveOnHand(product.initialStock, product.variants);
    const incomingBefore = Math.max(0, Number(product.inventory.incoming || 0));
    if (original.movementType === "PURCHASE") {
      nextBalances = adjustLocationBalance(nextBalances, destination, { incomingDelta: delta, variantId, variantLabel: original.variantLabel });
    } else if (original.movementType === "RECEIPT") {
      nextBalances = adjustLocationBalance(nextBalances, destination, { incomingDelta: -delta, onHandDelta: delta, variantId, variantLabel: original.variantLabel });
      if (variantId && product.variants) {
        if (Number(variant?.stockQuantity || 0) + delta < 0) return NextResponse.json({ message: "Company variant stock cannot be negative." }, { status: 409 });
        nextVariants = updateVariantOnHand(product.variants, variantId, delta);
        companyAfter = variantStockTotal(nextVariants);
      } else {
        companyAfter += delta;
        if (companyAfter < 0) return NextResponse.json({ message: "Company stock cannot be negative." }, { status: 409 });
      }
    } else {
      if (source) nextBalances = adjustLocationBalance(nextBalances, source, { onHandDelta: -delta, variantId, variantLabel: original.variantLabel });
      nextBalances = adjustLocationBalance(nextBalances, destination, { onHandDelta: delta, variantId, variantLabel: original.variantLabel });
    }
    const originalAllocatedIncoming = allocatedIncoming(balances);
    const legacyIncoming = incomingBefore - originalAllocatedIncoming;
    if (legacyIncoming < 0) return NextResponse.json({ message: "Existing incoming ledger is inconsistent. Review before correcting." }, { status: 409 });
    const incomingAfter = legacyIncoming + allocatedIncoming(nextBalances);
    const now = new Date().toISOString();
    const correctionId = `inventoryMovementCorrection.${randomUUID().replaceAll("-", "")}`;
    const tx = serverClient.transaction();
    if (original.movementType === "RECEIPT") {
      tx.patch(productId, (patch) => patch.ifRevisionId(product._rev).set({
        initialStock: companyAfter,
        ...(nextVariants ? { variants: nextVariants } : {}),
        available: companyAfter > 0,
      }));
    }
    tx.patch(product.inventory._id, (patch) => patch.ifRevisionId(product.inventory!._rev!).set({
      locationBalances: nextBalances, incoming: incomingAfter,
    }));
    tx.patch(movementId, (patch) => patch.ifRevisionId(revision).set({
      correctedQuantity: newQuantity,
      correctedMovementValue: Math.max(0, Number(original.unitCost || 0)) * newQuantity,
      correctedAt: now, correctedBy: staff.customerName, correctionReason: reason,
      ...(isVoid ? { voidedAt: now, voidedBy: staff.customerName } : {}),
    }));
    tx.create({
      _id: correctionId, _type: "inventoryMovementCorrection",
      originalMovement: { _type: "reference", _ref: movementId },
      movementNumber: original.movementNumber, product: { _type: "reference", _ref: productId },
      movementType: original.movementType,
      variantId: variantId || null, sourceStoreId: sourceId || (fromUnallocated ? UNALLOCATED : null), destinationStoreId: destinationId,
      previousQuantity: oldQuantity, correctedQuantity: newQuantity, difference: delta,
      correctionType: isVoid ? "VOID" : "EDIT",
      companyOnHandAfter: companyAfter, incomingAfter,
      reason, actor: { _type: "reference", _ref: staff.customerId }, actorName: staff.customerName,
      actorRole: staff.role, createdAt: now,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, movementId, oldQuantity, newQuantity, voided: isVoid, incomingAfter, companyOnHandAfter: companyAfter });
  } catch (cause) {
    console.error("Stock movement correction failed:", cause);
    return NextResponse.json({ message: cause instanceof Error && /revision|conflict/i.test(cause.message) ? "Stock changed during correction. Refresh and try again." : "Unable to correct stock. No partial correction was saved." }, { status: 409 });
  }
}

// DBK-83: restore an archived movement on demand for an audited correction.
// This creates ONLY the original history document (no change in stock or payments).
// The existing revision-checked PATCH is still required for the actual correction.
export async function PUT(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({message:"Only Admin and Store Manager can restore movement history.",status:staff.status},{status:staff.status});
  if (dbk69InventoryEnabled()) return NextResponse.json({message:"Restoration blocked during Neon inventory authority."},{status:409});
  let body: { movementId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({message:"Invalid restoration request."},{status:400}); }
  const id = typeof body.movementId === "string" ? body.movementId.trim() : "";
  if (!/^inventoryMovement\.[A-Za-z0-9_-]+$/.test(id)) return NextResponse.json({message:"Invalid movement ID."},{status:400});
  try {
    const doc = await dbk83GetVerifiedRestorableMovement(id);
    const existing = await serverClient.fetch<{_id:string}|null>(
      `*[_type == "inventoryMovement" && _id == $id][0]{_id}`, {id}, {cache:"no-store"});
    if (!existing) {
      await serverClient.createIfNotExists(doc as Parameters<typeof serverClient.createIfNotExists>[0]);
    }
    return NextResponse.json({ok:true, movementId:id, restored:!existing,
      message:"Historical movement is available for reviewed correction. Reload the movement and use Edit / Void."});
  } catch (error) {
    console.error("DBK-83 movement restoration rejected", error);
    return NextResponse.json({message:"Unable to restore verified historical movement. No stock balances were changed."},{status:409});
  }
}
