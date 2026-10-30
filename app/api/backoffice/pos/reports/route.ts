import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getSalesReport } from "@/lib/pos/operations";
import { dbk62CutoverRequested } from "@/lib/db/dbk62-pos-cutover";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  // Do not produce a misleading Sanity-only report after inventory moves to Neon.
  if (dbk62CutoverRequested() && process.env.DBK75_NEON_REPORT_READS !== 'YES') return NextResponse.json(
    {message:"Sales reporting cutover is incomplete; cannot show Sanity-only totals"},{status:503});
  const params = new URL(request.url).searchParams;
  const raw = params.get("period");
  const period = raw === "week" || raw === "month" ? raw : "day";
  const from = params.get("from")?.trim() || undefined;
  const to = params.get("to")?.trim() || undefined;
  if (staff.role === "MANAGER" && !staff.storeLocationId) {
    return NextResponse.json({ message: "Manager must be assigned to a store to view reports." }, { status: 403 });
  }
  const storeId = staff.role === "MANAGER" ? staff.storeLocationId : (params.get("store")?.trim() || undefined);
  try {
    return NextResponse.json({ report: await getSalesReport(period, { from, to, storeId }) });
  } catch (cause) {
    console.error("[DBK-72] Sales report failed", cause);
    const invalidRange = cause instanceof Error && /^(Select both From and To|The report From date|Report dates must|Select a valid report date)/.test(cause.message);
    return NextResponse.json({ message: invalidRange ? (cause as Error).message : "Sales reporting is temporarily unavailable; check server logs." },
      { status: invalidRange ? 400 : 503 });
  }
}
