import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import {
  createPosMpesaSale,
  createPosPaystackSale,
  type PosSaleInput,
} from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });

  try {
    const body = (await request.json()) as PosSaleInput;
    if (!["mpesa", "paystack"].includes(body.paymentMethod)) {
      return NextResponse.json({ message: "This shop is cashless. Select M-PESA or Paystack." }, { status: 400 });
    }

    const seller = {
      id: staff.customerId,
      name: staff.customerName,
      email: staff.customerEmail,
      role: staff.role,
    };

    const origin = new URL(request.url).origin;
    const result = body.paymentMethod === "mpesa"
      ? await createPosMpesaSale(body, seller)
      : await createPosPaystackSale(body, seller, origin);

    return NextResponse.json(result);
  } catch (cause) {
    console.error("[POS sale] failed", cause);
    return NextResponse.json(
      { message: cause instanceof Error ? cause.message : "Unable to complete POS sale." },
      { status: 400 },
    );
  }
}
