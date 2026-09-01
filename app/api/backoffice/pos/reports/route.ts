import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getSalesReport } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const params = new URL(request.url).searchParams;
  const raw = params.get("period");
  const period = raw === "week" || raw === "month" ? raw : "day";
  const from = params.get("from")?.trim() || undefined;
  const to = params.get("to")?.trim() || undefined;
  try {
    return NextResponse.json({ report: await getSalesReport(period, { from, to }) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to build sales report." }, { status: 400 });
  }
}
