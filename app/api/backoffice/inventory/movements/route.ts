import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { effectiveOnHand, hasVariants, variantLabel, variantStockTotal, type StockVariant } from "@/lib/inventory/stock";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type IncomingVariant = {
  _key?: string;
  variantId?: string;
  variantLabel?: string;
  quantity?: number;
};

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
    location?: string;
    incoming?: number;
    incomingByVariant?: IncomingVariant[];
    unitCost?: number;
  } | null;
};

function inventoryDocumentId(productId: string) {
  return `inventory.${productId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

function movementNumber() {
  const now = new Date();
  return `DBK-INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function incomingForVariant(rows: IncomingVariant[] | undefined, variantId: string) {
  return Math.max(0, Number(rows?.find((row) => row.variantId === variantId)?.quantity || 0));
}

function updateIncomingVariant(
  rows: IncomingVariant[] | undefined,
  variant: StockVariant,
  quantityChange: number,
) {
  const variantId = variant._key || "";
  const existing = [...(rows || [])];
  const index = existing.findIndex((row) => row.variantId === variantId);
  const current = index >= 0 ? Math.max(0, Number(existing[index]?.quantity || 0)) : 0;
  const next = Math.max(0, current + quantityChange);
  const row: IncomingVariant = {
    _key: variantId || randomUUID().replaceAll("-", ""),
    variantId,
    variantLabel: variantLabel(variant),
    quantity: next,
  };
  if (index >= 0) existing[index] = { ...existing[index], ...row };
  else existing.push(row);
  return existing.filter((item) => Number(item.quantity || 0) > 0);
}

function updateVariantOnHand(variants: StockVariant[], variantId: string, quantityChange: number) {
  return variants.map((variant) => {
    if (variant._key !== variantId) return variant;
    return {
      ...variant,
      stockQuantity: Math.max(0, Number(variant.stockQuantity || 0) + quantityChange),
    };
  });
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const movements = await serverClient.fetch(
    `*[_type == "inventoryMovement" && movementType in ["PURCHASE", "RECEIPT", "TRANSFER"]] | order(createdAt desc)[0...100]{
      _id,movementNumber,movementType,productName,variantId,variantLabel,quantityChange,stockBefore,stockAfter,incomingBefore,incomingAfter,sourceLocation,destination,unitCost,movementValue,actorName,note,createdAt
    }`,
    {},
    { cache: "no-store" },
  );

  return NextResponse.json({ movements });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const body = (await request.json()) as {
      action?: "PURCHASE" | "RECEIVE" | "TRANSFER";
      productId?: string;
      variantId?: string;
      quantity?: number;
      destination?: string;
      note?: string;
    };
    const action = body.action;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
    const quantity = Math.floor(Number(body.quantity || 0));
    const destination = typeof body.destination === "string" ? body.destination.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!productId) return NextResponse.json({ message: "Select a product." }, { status: 400 });
    if (!action || !["PURCHASE", "RECEIVE", "TRANSFER"].includes(action)) {
      return NextResponse.json({ message: "Choose Purchase stock, Receive stock or Transfer stock." }, { status: 400 });
    }
    if (!(quantity > 0)) return NextResponse.json({ message: "Quantity must be at least 1." }, { status: 400 });
    if ((action === "RECEIVE" || action === "TRANSFER") && !destination) {
      return NextResponse.json({ message: action === "RECEIVE" ? "Select the store/location receiving this stock." : "Destination is required for a stock transfer." }, { status: 400 });
    }

    const product = await serverClient.fetch<ProductRow | null>(
      `*[_type == "product" && _id == $productId][0]{
        _id,_rev,name,sku,initialStock,procurementCost,variants,
        "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{_id,location,incoming,incomingByVariant,unitCost}
      }`,
      { productId },
      { cache: "no-store" },
    );
    if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });

    const variantProduct = hasVariants(product.variants);
    const selectedVariant = variantProduct ? product.variants?.find((variant) => variant._key === variantId) : undefined;
    if (variantProduct && !selectedVariant) {
      return NextResponse.json({ message: "Select a product variant so its quantity remains in sync with total stock." }, { status: 400 });
    }

    const before = effectiveOnHand(product.initialStock, product.variants);
    const aggregateIncomingBefore = Math.max(0, Number(product.inventory?.incoming || 0));
    const selectedIncomingBefore = selectedVariant
      ? incomingForVariant(product.inventory?.incomingByVariant, variantId)
      : aggregateIncomingBefore;

    if (action === "RECEIVE" && quantity > selectedIncomingBefore) {
      return NextResponse.json({ message: `Only ${selectedIncomingBefore} purchased unit${selectedIncomingBefore === 1 ? " is" : "s are"} awaiting receipt${selectedVariant ? ` for ${variantLabel(selectedVariant)}` : ""}.` }, { status: 409 });
    }

    const selectedOnHand = selectedVariant ? Math.max(0, Number(selectedVariant.stockQuantity || 0)) : before;
    if (action === "TRANSFER" && quantity > selectedOnHand) {
      return NextResponse.json({ message: `Only ${selectedOnHand} unit${selectedOnHand === 1 ? " is" : "s are"} currently in stock${selectedVariant ? ` for ${variantLabel(selectedVariant)}` : ""}.` }, { status: 409 });
    }

    let nextVariants = product.variants;
    let after = before;
    let incomingAfter = aggregateIncomingBefore;
    let incomingByVariant = product.inventory?.incomingByVariant || [];

    if (action === "PURCHASE") {
      incomingAfter = aggregateIncomingBefore + quantity;
      if (selectedVariant) incomingByVariant = updateIncomingVariant(incomingByVariant, selectedVariant, quantity);
    } else if (action === "RECEIVE") {
      incomingAfter = Math.max(0, aggregateIncomingBefore - quantity);
      if (selectedVariant && product.variants) {
        incomingByVariant = updateIncomingVariant(incomingByVariant, selectedVariant, -quantity);
        nextVariants = updateVariantOnHand(product.variants, variantId, quantity);
        after = variantStockTotal(nextVariants);
      } else {
        after = before + quantity;
      }
    } else if (action === "TRANSFER") {
      if (selectedVariant && product.variants) {
        nextVariants = updateVariantOnHand(product.variants, variantId, -quantity);
        after = variantStockTotal(nextVariants);
      } else {
        after = before - quantity;
      }
    }

    const unitCost = Math.max(0, Number(product.inventory?.unitCost ?? product.procurementCost ?? 0));
    const inventoryId = product.inventory?._id || inventoryDocumentId(productId);
    const movementId = `inventoryMovement.${randomUUID().replaceAll("-", "")}`;
    const now = new Date().toISOString();
    const currentLocation = product.inventory?.location || "Main store";

    const transaction = serverClient.transaction();
    if (action !== "PURCHASE") {
      transaction.patch(productId, (patch) =>
        patch.ifRevisionId(product._rev).set({
          initialStock: after,
          ...(nextVariants ? { variants: nextVariants } : {}),
          available: after > 0,
        }),
      );
    }

    transaction.createIfNotExists({
      _id: inventoryId,
      _type: "inventoryRecord",
      product: { _type: "reference", _ref: productId },
      location: currentLocation,
      reserved: 0,
      incoming: 0,
      incomingByVariant: [],
      reorderPoint: 5,
      unitCost,
    });
    transaction.patch(inventoryId, (patch) => patch.set({
      incoming: incomingAfter,
      incomingByVariant,
      ...(action === "RECEIVE" ? { location: destination } : {}),
    }));

    const movementType = action === "PURCHASE" ? "PURCHASE" : action === "RECEIVE" ? "RECEIPT" : "TRANSFER";
    transaction.create({
      _id: movementId,
      _type: "inventoryMovement",
      movementNumber: movementNumber(),
      movementType,
      product: { _type: "reference", _ref: productId },
      productId,
      productName: product.name || "Product",
      ...(selectedVariant ? { variantId, variantLabel: variantLabel(selectedVariant) } : {}),
      quantityChange: action === "TRANSFER" ? -quantity : quantity,
      stockBefore: before,
      stockAfter: after,
      incomingBefore: aggregateIncomingBefore,
      incomingAfter,
      sourceLocation: action === "PURCHASE" ? "Supplier / purchase" : action === "RECEIVE" ? "Incoming stock" : currentLocation,
      ...(action === "RECEIVE" || action === "TRANSFER" ? { destination } : {}),
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
      stockBefore: before,
      stockAfter: after,
      incomingBefore: aggregateIncomingBefore,
      incomingAfter,
      unitCost,
      movementId,
    });
  } catch (cause) {
    console.error("Inventory movement failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update inventory." }, { status: 500 });
  }
}
