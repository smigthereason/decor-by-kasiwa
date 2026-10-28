import { NextResponse } from "next/server";
import { getApiStaff } from "@/lib/auth/api-authorization";
import { previewDBK58ManualPosSale, type PosSaleInput } from "@/lib/pos/server";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

/** DBK-58 — local-only authenticated READ-ONLY POS/Neon contract preview.
 * No transaction wrapper is called. No production POS route is modified.
 * This must not be treated as a payment verification or completed sale.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.DBK58_LOCAL_PREVIEW !== "YES") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "A same-origin JSON request is required." }, { status: 403 });
  }
  // Restrict this candidate API to an active administrator. The existing
  // production sale route continues to authorize STORE/MANAGER/STORE_STAFF.
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized" }, { status: staff.status });
  try {
    const body = (await request.json()) as PosSaleInput;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ message: "Invalid request." }, { status: 400 });
    }
    const storeId = typeof body.storeLocationId === "string" ? body.storeLocationId.trim() : "";
    if (!storeId) return NextResponse.json({ message: "Select a store." }, { status: 400 });
    const storeLocation = await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
      `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`,
      { id: storeId },
      { cache: "no-store" },
    );
    if (!storeLocation) return NextResponse.json({ message: "Select an active store." }, { status: 400 });
    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
      storeLocationId: storeLocation._id,
      storeLocationName: storeLocation.name || "Store",
      storeLocationCode: storeLocation.code || "",
    };
    const preview = await previewDBK58ManualPosSale(body, seller);
    return NextResponse.json(preview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    // Do not expose raw database/provider internals or customer details.
    if (error instanceof Error && /^DBK-58 preview is disabled/.test(error.message)) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ message: "Preview validation failed. Review the test input and live stock." }, { status: 400 });
  }
}
