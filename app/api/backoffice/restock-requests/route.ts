import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import type { RestockReason } from "@/lib/operations/types";
import { serverClient } from "@/sanity/lib/serverClient";

const reasons: RestockReason[] = ["out_of_stock", "low_stock", "needs_restock"];

export async function POST(request: Request) {
  const staff = await getApiStaff(["STORE_STAFF", "STORE", "ADMIN"]);

  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const body = (await request.json()) as {
    productId?: string;
    reason?: RestockReason;
    note?: string;
  };

  const productId = body.productId?.trim();
  const reason = body.reason || "needs_restock";

  if (!productId || !reasons.includes(reason)) {
    return NextResponse.json({ message: "Product and valid restock reason are required." }, { status: 400 });
  }

  try {
    const product = await serverClient.fetch<{ _id: string; name?: string; sku?: string } | null>(
      `*[_type == "product" && _id == $id][0]{_id, name, sku}`,
      { id: productId },
      { cache: "no-store" },
    );

    if (!product) {
      return NextResponse.json({ message: "Product not found." }, { status: 404 });
    }

    const existing = await serverClient.fetch<{ _id: string } | null>(
      `*[_type == "restockRequest" && product._ref == $productId && status in ["open", "acknowledged"]][0]{_id}`,
      { productId },
      { cache: "no-store" },
    );

    if (existing) {
      return NextResponse.json(
        { message: "A restock alert is already open for this product." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const created = await serverClient.create({
      _type: "restockRequest",
      product: { _type: "reference", _ref: productId },
      productName: product.name || "Product",
      sku: product.sku || "NO-SKU",
      requestedBy: { _type: "reference", _ref: staff.customerId },
      requestedByName: staff.customerName,
      reason,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 600) : "",
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ ok: true, id: created._id }, { status: 201 });
  } catch (error) {
    console.error("Restock request creation failed:", error);
    return NextResponse.json({ message: "Restock alert could not be created." }, { status: 500 });
  }
}
