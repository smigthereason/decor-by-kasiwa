import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { dbk109MaintenanceDecision, dbk109FreezeMessage } from "@/lib/db/dbk109-maintenance";
import { serverClient } from "@/sanity/lib/serverClient";

/**
 * Reversible removal from sale. Never delete registered inventory identities,
 * historical movements, payments, orders or catalogue references.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const maintenance = await dbk109MaintenanceDecision();
  if (maintenance !== "OPEN") {
    return NextResponse.json(
      { code: "DBK109_CUTOVER_FREEZE", message: dbk109FreezeMessage(maintenance) },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) {
    return NextResponse.json({ message: "Access denied." }, { status: staff.status });
  }

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  try {
    const product = await serverClient.fetch<{
      _id: string;
      _rev: string;
      available?: boolean;
      ecommerceEnabled?: boolean;
      posEnabled?: boolean;
    } | null>(
      `*[_type == "product" && _id == $productId][0]{_id,_rev,available,ecommerceEnabled,posEnabled}`,
      { productId },
      { cache: "no-store" },
    );

    if (!product) {
      return NextResponse.json({ message: "Product not found." }, { status: 404 });
    }

    // Idempotent on retries; no stock tables or movement records are touched.
    if (product.available === false && product.ecommerceEnabled === false && product.posEnabled === false) {
      return NextResponse.json({ ok: true, archived: true });
    }

    await serverClient.patch(productId)
      .ifRevisionId(product._rev)
      .set({ available: false, ecommerceEnabled: false, posEnabled: false })
      .commit();

    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/admin/products");
    revalidatePath("/admin/pos");
    return NextResponse.json({ ok: true, archived: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("[DBK145] Product archive failed", { productId, cause });
    const status = cause && typeof cause === "object"
      ? (cause as { statusCode?: number; status?: number })
      : null;
    if (status?.statusCode === 409 || status?.status === 409) {
      return NextResponse.json(
        { message: "Product information changed. Reload the product and try again." },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { message: "Unable to remove this product from sale. Please try again." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
