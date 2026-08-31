import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { listReceivables } from "@/lib/pos/operations";
import { recordOutstandingCashPayment } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    return NextResponse.json({ receivables: await listReceivables() });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load receivables." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    const body = await request.json() as { orderId?: string; amount?: number };
    if (!body.orderId) return NextResponse.json({ message: "Order is required." }, { status: 400 });
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role };
    return NextResponse.json(await recordOutstandingCashPayment({ orderId: body.orderId, amount: Number(body.amount || 0), seller }));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to record receivable payment." }, { status: 400 });
  }
}
