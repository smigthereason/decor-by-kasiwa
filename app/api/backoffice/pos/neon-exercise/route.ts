import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { previewDBK58ManualPosSale, type PosSaleInput } from "@/lib/pos/server";
import { exerciseDBK59ManualSale } from "@/lib/db/dbk59-pos-exercise";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

/**
 * DBK-59: local ADMIN-only validation of the *real* POS calculation against the
 * ISOLATED Neon test engine. PostgreSQL exercises the atomic sale and rolls
 * back *all* resulting writes before returning. NOT A SALE OR PAYMENT.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "development" ||
      process.env.DBK58_LOCAL_PREVIEW !== "YES" ||
      process.env.DBK59_LOCAL_EXERCISE !== "YES" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (request.headers.get("origin") !== url.origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Same-origin JSON required" }, { status: 403 });
  }
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized" }, { status: staff.status });
  try {
    const input = (await request.json()) as PosSaleInput;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    const storeId = typeof input.storeLocationId === "string" ? input.storeLocationId.trim() : "";
    if (!storeId) return NextResponse.json({ message: "Select a store" }, { status: 400 });
    const store = await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
      `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`,
      { id: storeId },
      { cache: "no-store" },
    );
    if (!store) return NextResponse.json({ message: "Select an active store" }, { status: 400 });
    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
      storeLocationId: store._id,
      storeLocationName: store.name || "Store",
      storeLocationCode: store.code || "",
    };
    // Live stock and pricing validated in Sanity, but NEVER mutated here.
    // Enforces synthetic references, cashier confirmation and correct variants.
    const preview = await previewDBK58ManualPosSale(input, seller);
    const result = await exerciseDBK59ManualSale(preview.candidate);
    return NextResponse.json({
      stage: "DBK-59",
      mode: "ISOLATED_TEST_ROLLBACK",
      noWritesPersisted: true,
      simulatedPayment: true,
      wouldCommit: true,
      testResult: result,
      calculation: preview.calculation,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    // Do not expose SQL errors, connection strings, customer details or receipts.
    console.error("[DBK-59 test] Exercise failed:", e instanceof Error ? e.message : "Unknown error");
    return NextResponse.json({
      message: "DBK-59 isolated exercise did not pass. Check local server logs and confirm the Neon test seed still matches the product and store.",
      mode: "ISOLATED_TEST_ROLLBACK",
      noWritesPersisted: true,
    }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  }
}
