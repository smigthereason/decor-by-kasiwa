import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getSalesReport } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const raw = new URL(request.url).searchParams.get("period");
  const period = raw === "week" || raw === "month" ? raw : "day";
  try {
    return NextResponse.json({ report: await getSalesReport(period) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to build sales report." }, { status: 400 });
  }
}
