import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { toSanityServiceError } from "@/lib/sanity-error";
import {
  createPosManualSale,
  createPosMpesaSale,
  type PosSaleInput,
} from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const body = (await request.json()) as PosSaleInput;
    if (!["mpesa", "manual"].includes(body.paymentMethod)) {
      return NextResponse.json({ message: "Select Direct M-PESA or Manual Payment." }, { status: 400 });
    }

    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
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
