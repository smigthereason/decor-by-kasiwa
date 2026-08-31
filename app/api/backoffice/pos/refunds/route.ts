import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { processReturnRefund } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const body = await request.json() as Parameters<typeof processReturnRefund>[0];
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role };
    return NextResponse.json(await processReturnRefund(body, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to process return/refund." }, { status: 400 });
  }
}
