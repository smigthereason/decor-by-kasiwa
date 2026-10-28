import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { processReturnRefund } from "@/lib/pos/operations";
import { dbk62CutoverRequested } from "@/lib/db/dbk62-pos-cutover";
import { isDbk62RealOrderId } from "@/lib/db/dbk62-pos-mapper";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  try {
    if (dbk62CutoverRequested()) return NextResponse.json({message:"Refund integration is incomplete for Neon cutover"},{status:503});
    const body = await request.json() as Parameters<typeof processReturnRefund>[0];
    if (typeof body?.orderId === "string" && isDbk62RealOrderId(body.orderId)) {
      return NextResponse.json({message:"Neon refunds cannot be recorded in Sanity"},{status:403});
    }
    const seller = { id: staff.customerId, name: staff.customerName, email: staff.customerEmail, role: staff.role, storeLocationId: staff.storeLocationId, storeLocationName: staff.storeLocationName, storeLocationCode: staff.storeLocationCode };
    return NextResponse.json(await processReturnRefund(body, seller));
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to process return/refund." }, { status: 400 });
  }
}
