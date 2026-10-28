import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getPaymentReconciliation } from "@/lib/pos/operations";
import { dbk62ReadEnabled } from '@/lib/db/dbk62-pos-cutover';
import { dbk63ListReconciliation } from '@/lib/db/dbk63-financial-neon';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  if ((staff.role === "MANAGER" || staff.role === "STORE_STAFF") && !staff.storeLocationId) return NextResponse.json({ message: "Manager must be assigned to a store." }, { status: 403 });
  const requestedStoreId = new URL(request.url).searchParams.get("store")?.trim() || undefined;
  const storeId = (staff.role === "MANAGER" || staff.role === "STORE_STAFF") ? staff.storeLocationId : requestedStoreId;
  try {
    const legacy=await getPaymentReconciliation(500,storeId);
    if (!dbk62ReadEnabled()) return NextResponse.json({payments:legacy});
    const neon=await dbk63ListReconciliation(storeId);
    return NextResponse.json({payments:[...legacy,...neon]
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),sources:['sanity','neon']},
      {headers:{'Cache-Control':'private, no-store'}});
  } catch {
    return NextResponse.json({message:'Payment reconciliation data unavailable or incomplete'},
      {status:503});
  }
}
