import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

function inventoryDocumentId(productId: string) {
  const safe = productId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inventory.${safe}`;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const productId = decodeURIComponent(id);
  const body = (await request.json()) as Record<string, unknown>;

  const productPatch: Record<string, unknown> = {};
  if (typeof body.onHand === "number") productPatch.initialStock = Math.max(0, body.onHand);
  if (typeof body.retailPrice === "number") productPatch.price = Math.max(0, body.retailPrice);
  if (typeof body.available === "boolean") productPatch.available = body.available;

  const inventoryPatch: Record<string, unknown> = {};
  if (typeof body.location === "string") inventoryPatch.location = body.location.trim();
  if (typeof body.reserved === "number") inventoryPatch.reserved = Math.max(0, body.reserved);
  if (typeof body.incoming === "number") inventoryPatch.incoming = Math.max(0, body.incoming);
  if (typeof body.reorderPoint === "number") inventoryPatch.reorderPoint = Math.max(0, body.reorderPoint);
  if (typeof body.unitCost === "number") inventoryPatch.unitCost = Math.max(0, body.unitCost);

  try {
    const transaction = serverClient.transaction();

    if (Object.keys(productPatch).length > 0) {
      transaction.patch(productId, (patch) => patch.set(productPatch));
    }

    if (Object.keys(inventoryPatch).length > 0) {
      const inventoryId = inventoryDocumentId(productId);
      transaction.createIfNotExists({
        _id: inventoryId,
        _type: "inventoryRecord",
        product: { _type: "reference", _ref: productId },
        location: "Unassigned",
        reserved: 0,
        incoming: 0,
        reorderPoint: 5,
        unitCost: 0,
      });
      transaction.patch(inventoryId, (patch) => patch.set(inventoryPatch));
    }

    await transaction.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product update failed:", error);
    return NextResponse.json({ message: "Product update failed." }, { status: 500 });
  }
}
