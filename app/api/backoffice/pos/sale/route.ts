import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { toSanityServiceError } from "@/lib/sanity-error";
import { serverClient } from "@/sanity/lib/serverClient";
import {
  createPosManualSale,
  createPosMpesaSale,
  type PosSaleInput,
} from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

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

    const result = body.paymentMethod === "mpesa"
      ? await createPosMpesaSale(body, seller)
      : await createPosManualSale(body, seller);

    return NextResponse.json(result);
  } catch (cause) {
    console.error("[POS sale] failed", cause);
    const failure = toSanityServiceError(cause, "Unable to complete POS sale.");
    return NextResponse.json(
      { message: failure.message },
      { status: failure.status === 500 ? 400 : failure.status },
    );
  }
}
