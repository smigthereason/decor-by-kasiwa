import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getPosReceipt } from "@/lib/pos/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ message: "Order ID is required." }, { status: 400 });
  const receipt = await getPosReceipt(id);
  if (!receipt) return NextResponse.json({ message: "Receipt not found." }, { status: 404 });
  return NextResponse.json({ receipt });
}
