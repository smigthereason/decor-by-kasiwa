import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { listSalesHistory } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const limit = Number(params.get("limit") || 150);
  try {
    return NextResponse.json({ orders: await listSalesHistory({ limit, channel: channel === "POS" || channel === "ONLINE" ? channel : undefined }) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to load sales history." }, { status: 400 });
  }
}
