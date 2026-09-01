import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

function inventoryDocumentId(productId: string) {
  const safe = productId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inventory.${safe}`;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "on", "yes"].includes(value.toLowerCase());
  return undefined;
}

async function uploadHeroImage(file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "Upload"} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);

  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `product-${Date.now()}`,
    contentType: file.type || undefined,
  });

  return {
    _type: "image",
    asset: { _type: "reference", _ref: asset._id },
  };
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

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    let heroImageFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        name: form.get("name"),
        shortDescription: form.get("shortDescription"),
        description: form.get("description"),
        onHand: form.get("onHand"),
        reserved: form.get("reserved"),
        incoming: form.get("incoming"),
        reorderPoint: form.get("reorderPoint"),
        unitCost: form.get("unitCost"),
        retailPrice: form.get("retailPrice"),
        location: form.get("location"),
        available: form.get("available"),
        bestSeller: form.get("bestSeller"),
      };
      const candidate = form.get("heroImage");
      heroImageFile = candidate instanceof File && candidate.size > 0 ? candidate : null;
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    const productPatch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = cleanString(body.name);
      if (!name) return NextResponse.json({ message: "Product name cannot be empty." }, { status: 400 });
      productPatch.name = name;
    }
    if (body.shortDescription !== undefined) productPatch.shortDescription = cleanString(body.shortDescription);
    if (body.description !== undefined) productPatch.description = cleanString(body.description);

    const onHand = numericValue(body.onHand);
    if (onHand !== undefined) productPatch.initialStock = Math.max(0, onHand);
    const retailPrice = numericValue(body.retailPrice);
    if (retailPrice !== undefined) productPatch.price = Math.max(0, retailPrice);
    const available = booleanValue(body.available);
    if (available !== undefined) productPatch.available = available;
    const bestSeller = booleanValue(body.bestSeller);
    if (bestSeller !== undefined) productPatch.bestSeller = bestSeller;

    const heroImage = await uploadHeroImage(heroImageFile);
    if (heroImage) productPatch.heroImage = heroImage;

    const inventoryPatch: Record<string, unknown> = {};
    if (body.location !== undefined) inventoryPatch.location = cleanString(body.location);
    const reserved = numericValue(body.reserved);
    if (reserved !== undefined) inventoryPatch.reserved = Math.max(0, reserved);
    const incoming = numericValue(body.incoming);
    if (incoming !== undefined) inventoryPatch.incoming = Math.max(0, incoming);
    const reorderPoint = numericValue(body.reorderPoint);
    if (reorderPoint !== undefined) inventoryPatch.reorderPoint = Math.max(0, reorderPoint);
    const unitCost = numericValue(body.unitCost);
    if (unitCost !== undefined) inventoryPatch.unitCost = Math.max(0, unitCost);

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
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Product update failed." },
      { status: 500 },
    );
  }
}
