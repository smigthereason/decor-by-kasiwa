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
    ] | order(createdAt desc, _id desc)[${offset}...${offset + MOVEMENT_PAGE_SIZE + 1}]{
      _id,movementNumber,movementType,productName,variantId,variantLabel,quantityChange,stockBefore,stockAfter,
      incomingBefore,incomingAfter,sourceLocation,destination,"sourceStoreId":sourceStore._ref,"destinationStoreId":destinationStore._ref,
      unitCost,movementValue,actorName,note,createdAt
    }`,
    { scope, type: movementType, from: from || "", to: to || "", needle },
    { cache: "no-store" },
  );

  const hideCost = staff.role === "MANAGER" || staff.role === "STORE_STAFF";
  const page = movements.slice(0, MOVEMENT_PAGE_SIZE);
  return NextResponse.json({
    movements: hideCost ? page.map(({ unitCost: _unitCost, movementValue: _movementValue, ...movement }) => movement) : page,
    hasMore: movements.length > MOVEMENT_PAGE_SIZE,
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
