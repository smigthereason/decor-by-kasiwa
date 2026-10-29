import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getPosReceipt } from "@/lib/pos/server";
import { dbk61SandboxAllowed, dbk61ReadReceipt, isDbk61SyntheticOrderId } from "@/lib/db/dbk61-pos-compat";
import { dbk62ReadEnabled, dbk62ReadReceipt } from "@/lib/db/dbk62-pos-cutover";
import { isDbk62RealOrderId } from "@/lib/db/dbk62-pos-mapper";
import { dbk68ReadEnabled, dbk68ReadReceipt } from "@/lib/db/dbk68-daraja-neon";
import { dbk68IsOrderId } from "@/lib/db/dbk68-daraja-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ message: "Order ID is required." }, { status: 400 });
  if (isDbk61SyntheticOrderId(id)) {
    if (staff.role !== "ADMIN" || !dbk61SandboxAllowed(request)) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }
    try {
      const receipt = await dbk61ReadReceipt(id);
      return receipt ? NextResponse.json({ receipt, testOnly: true }, { headers: { "Cache-Control": "private, no-store" } })
        : NextResponse.json({ message: "Synthetic receipt not found" }, { status: 404 });
    } catch { return NextResponse.json({ message: "Test-branch receipt unavailable" }, { status: 409 }); }
  }
  if (dbk68IsOrderId(id)) {
    if (!dbk68ReadEnabled()) return NextResponse.json({ message: "Neon M-PESA receipts disabled" }, { status: 503 });
    try {
      const receipt = await dbk68ReadReceipt(id);
      if (!receipt) return NextResponse.json({ message: "Receipt not found" }, { status: 404 });
      if ((staff.role === "MANAGER" || staff.role === "STORE_STAFF") &&
          (!staff.storeLocationId || staff.storeLocationId !== receipt.storeLocationId)) {
        return NextResponse.json({ message: "Unauthorized receipt location" }, { status: 403 });
      }
      if (receipt.paymentStatus !== 'paid') return NextResponse.json({ message: "Payment not confirmed" }, { status: 409 });
      return NextResponse.json({ receipt }, { headers: { "Cache-Control": "private, no-store" } });
    } catch { return NextResponse.json({ message: "Neon M-PESA receipt unavailable" }, { status: 503 }); }
  }
  if (isDbk62RealOrderId(id)) {
    if (!dbk62ReadEnabled()) return NextResponse.json({message:"Neon receipt backend unavailable"},{status:503});
    try {
      const receipt = await dbk62ReadReceipt(id);
      if (!receipt) return NextResponse.json({message:"Receipt not found"},{status:404});
      if ((staff.role === "MANAGER" || staff.role === "STORE_STAFF") &&
          (!staff.storeLocationId || receipt.storeLocationId !== staff.storeLocationId)) {
        return NextResponse.json({message:"Unauthorized receipt location"},{status:403});
      }
      return NextResponse.json({receipt},{headers:{"Cache-Control":"private, no-store"}});
    } catch {
      return NextResponse.json({message:"Neon receipt unavailable"},{status:503});
    }
  }
  const receipt = await getPosReceipt(id);
  if (!receipt) return NextResponse.json({ message: "Receipt not found." }, { status: 404 });
  return NextResponse.json({ receipt });
}
