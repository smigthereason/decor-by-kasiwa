import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getSalesReport } from "@/lib/pos/operations";
import { dbk62CutoverRequested } from "@/lib/db/dbk62-pos-cutover";
import { dbk75NeonReportsRequested } from "@/lib/pos/dbk75-neon-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  // Do not produce a misleading Sanity-only report after inventory moves to Neon.
  if (dbk62CutoverRequested() && !dbk75NeonReportsRequested()) return NextResponse.json(
    {code:"NEON_REPORT_READS_DISABLED",message:"Sales reporting requires Neon reporting to be configured; Sanity-only totals would omit live sales."},{status:503});
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
    return NextResponse.json({ code: invalidRange ? "INVALID_REPORT_RANGE" : "REPORT_SOURCE_ERROR", message: invalidRange ? (cause as Error).message : "Sales reporting is temporarily unavailable; check server logs. No totals have been omitted." },
      { status: invalidRange ? 400 : 503 });
  }
}
