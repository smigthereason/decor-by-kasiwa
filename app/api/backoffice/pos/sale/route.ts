import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { toSanityServiceError } from "@/lib/sanity-error";
import { serverClient } from "@/sanity/lib/serverClient";
import { dbk61SandboxAllowed, dbk61StageManualSale } from "@/lib/db/dbk61-pos-compat";
import { dbk62CutoverRequested, dbk62CreateRealManualSale } from "@/lib/db/dbk62-pos-cutover";
import { dbk68Requested, dbk68CreateSale } from "@/lib/db/dbk68-daraja-neon";
import {
  createPosManualSale,
  createPosMpesaSale,
  type PosSaleInput,
} from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  const sandboxHeader = request.headers.get("x-dbk61-sandbox");
  if (sandboxHeader !== null) {
    if (sandboxHeader !== "synthetic-manual" || !dbk61SandboxAllowed(request)) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    if (staff.role !== "ADMIN" || request.headers.get("origin") !== new URL(request.url).origin ||
        !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ message: "Synthetic local ADMIN requests only" }, { status: 403 });
    }
  }
  try {
    const body = (await request.json()) as PosSaleInput;
    if (!["mpesa", "manual"].includes(body.paymentMethod)) {
      return NextResponse.json({ message: "Select Direct M-PESA or Manual Payment." }, { status: 400 });
    }

    const requestedStoreId = typeof body.storeLocationId === "string" ? body.storeLocationId.trim() : "";
    const assignedRole = staff.role === "MANAGER" || staff.role === "STORE_STAFF";
    if (assignedRole && !staff.storeLocationId) {
      return NextResponse.json({ message: "This POS user is not assigned to a store/location. Ask Admin to assign one under Staff." }, { status: 400 });
    }
    if (assignedRole && requestedStoreId && requestedStoreId !== staff.storeLocationId) {
      return NextResponse.json({ message: "This POS user can only record sales for their assigned store/location." }, { status: 403 });
    }
    const storeLocationId = assignedRole ? staff.storeLocationId || "" : requestedStoreId;
    if (!storeLocationId) {
      return NextResponse.json({ message: "Select the store/location running this POS sale." }, { status: 400 });
    }
    const storeLocation = await serverClient.fetch<{ _id: string; name?: string; code?: string } | null>(
      `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`,
      { id: storeLocationId },
      { cache: "no-store" },
    );
    if (!storeLocation) {
      return NextResponse.json({ message: "Select an active store/location for this POS sale." }, { status: 400 });
    }

    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
      storeLocationId: storeLocation._id,
      storeLocationName: storeLocation.name || "Store",
      storeLocationCode: storeLocation.code || "",
    };

    if (sandboxHeader !== null) {
      if (body.paymentMethod !== "manual") return NextResponse.json({ message: "Synthetic manual only" }, { status: 400 });
      const testResult = await dbk61StageManualSale(body, seller);
      return NextResponse.json(testResult, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Never fall back to Sanity if the Neon cutover is requested but fails.
    // Provider callbacks and online checkout must migrate before enabling DBK-62.
    if (dbk62CutoverRequested()) {
      if (body.paymentMethod === "mpesa") {
        if (!dbk68Requested()) return NextResponse.json({ message: "Direct M-PESA Neon cutover is not ready." }, { status: 503 });
        return NextResponse.json(await dbk68CreateSale(body, seller),
          { headers: { "Cache-Control": "private, no-store" } });
      }
      return NextResponse.json(await dbk62CreateRealManualSale(body, seller),
        { headers: { "Cache-Control": "private, no-store" } });
    }
    const result = body.paymentMethod === "mpesa"
      ? await createPosMpesaSale(body, seller)
      : await createPosManualSale(body, seller);

    return NextResponse.json(result);
  } catch (cause) {
    console.error("[POS sale] failed", cause);
    const failure = toSanityServiceError(cause, "Unable to complete POS sale.");
    // Preserve actionable stock, payment, and configuration validation failures.
    // Unexpected server failures must not be disguised as invalid cashier input.
    const message = cause instanceof Error && cause.message ? cause.message : failure.message;
    // Never convert an unexpected Sanity/server error to a cashier-side HTTP 400
    // merely because the provider message happens to mention "payment" or "stock".
    const isValidationError = /^(?:Enter |Select |Confirm |This POS user |A POS product |That payment reference |M-PESA STK Push requires |POS cart |POS payment |.* only has \d+ unit\(s\) available|.* no longer has enough stock)/i.test(message);
    const status = failure.status === 500 && isValidationError ? 400 : failure.status;
    const safeMessage = failure.status !== 500 || isValidationError ? message : failure.message;
    return NextResponse.json(
      { message: safeMessage, code: status === 402 ? "SANITY_QUOTA" : status === 400 ? "POS_VALIDATION" : "POS_SERVER_ERROR" },
      { status },
    );
  }
}
