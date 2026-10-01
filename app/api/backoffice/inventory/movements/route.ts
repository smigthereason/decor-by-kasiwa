import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type ProductRow = {
  _id: string;
  name?: string;
  sku?: string;
  initialStock?: number;
  procurementCost?: number;
  inventory?: {
    _id?: string;
    location?: string;
    incoming?: number;
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

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const movements = await serverClient.fetch(
    `*[_type == "inventoryMovement" && movementType in ["RECEIPT", "TRANSFER"]] | order(createdAt desc)[0...100]{
      _id,movementNumber,movementType,productName,quantityChange,stockBefore,stockAfter,sourceLocation,destination,unitCost,movementValue,actorName,note,createdAt
    }`,
    {},
    { cache: "no-store" },
  );

  return NextResponse.json({ movements });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const body = (await request.json()) as {
      action?: "RECEIVE" | "TRANSFER";
      productId?: string;
      quantity?: number;
      destination?: string;
      note?: string;
    };
    const action = body.action;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const quantity = Math.floor(Number(body.quantity || 0));
    const destination = typeof body.destination === "string" ? body.destination.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!productId) return NextResponse.json({ message: "Select a product." }, { status: 400 });
    if (!action || !["RECEIVE", "TRANSFER"].includes(action)) return NextResponse.json({ message: "Choose Receive stock or Transfer stock." }, { status: 400 });
    if (!(quantity > 0)) return NextResponse.json({ message: "Quantity must be at least 1." }, { status: 400 });
    if (action === "TRANSFER" && !destination) return NextResponse.json({ message: "Destination is required for a stock transfer." }, { status: 400 });

    const product = await serverClient.fetch<ProductRow | null>(
      `*[_type == "product" && _id == $productId][0]{
        _id,name,sku,initialStock,procurementCost,
        "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{_id,location,incoming,unitCost}
      }`,
      { productId },
      { cache: "no-store" },
    );
    if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });

    const before = Math.max(0, Number(product.initialStock || 0));
    if (action === "TRANSFER" && quantity > before) {
      return NextResponse.json({ message: `Only ${before} unit${before === 1 ? "" : "s"} are currently in stock.` }, { status: 409 });
    }

    const after = action === "RECEIVE" ? before + quantity : before - quantity;
    const unitCost = Math.max(0, Number(product.inventory?.unitCost ?? product.procurementCost ?? 0));
    const inventoryId = product.inventory?._id || inventoryDocumentId(productId);
    const movementId = `inventoryMovement.${randomUUID().replaceAll("-", "")}`;
    const now = new Date().toISOString();

    const transaction = serverClient.transaction();
    transaction.patch(productId, (patch) => patch.set({ initialStock: after }));
    transaction.createIfNotExists({
      _id: inventoryId,
      _type: "inventoryRecord",
      product: { _type: "reference", _ref: productId },
      location: product.inventory?.location || "Main store",
      reserved: 0,
      incoming: 0,
      reorderPoint: 5,
      unitCost,
    });
    if (action === "RECEIVE" && Number(product.inventory?.incoming || 0) > 0) {
      transaction.patch(inventoryId, (patch) => patch.set({ incoming: Math.max(0, Number(product.inventory?.incoming || 0) - quantity) }));
    }
    transaction.create({
      _id: movementId,
      _type: "inventoryMovement",
      movementNumber: movementNumber(),
      movementType: action === "RECEIVE" ? "RECEIPT" : "TRANSFER",
      product: { _type: "reference", _ref: productId },
      productId,
      productName: product.name || "Product",
      quantityChange: action === "RECEIVE" ? quantity : -quantity,
      stockBefore: before,
      stockAfter: after,
      sourceLocation: product.inventory?.location || "Main store",
      ...(action === "TRANSFER" ? { destination } : {}),
      unitCost,
      movementValue: unitCost * quantity,
      actor: { _type: "reference", _ref: staff.customerId },
      actorName: staff.customerName,
      actorRole: staff.role,
      note: note || undefined,
      createdAt: now,
    });
    await transaction.commit();

    return NextResponse.json({ ok: true, stockBefore: before, stockAfter: after, unitCost, movementId });
  } catch (cause) {
    console.error("Inventory movement failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to update inventory." }, { status: 500 });
  }
}
