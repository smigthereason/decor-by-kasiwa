import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getWebAnalytics, isGoogleAnalyticsReportingConfigured } from "@/lib/analytics/google";

export const dynamic = "force-dynamic";

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  if (!isGoogleAnalyticsReportingConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if ((from && !validDate(from)) || (to && !validDate(to))) {
    return NextResponse.json({ message: "Use dates in YYYY-MM-DD format." }, { status: 400 });
  }

  const startDate = from || (to ? "2020-01-01" : "30daysAgo");
  const endDate = to || "today";

  try {
    const report = await getWebAnalytics(startDate, endDate);
    return NextResponse.json({ configured: true, startDate, endDate, ...report });
  } catch (cause) {
    console.error("Google Analytics report failed:", cause);
    return NextResponse.json({ message: "Unable to load website analytics right now." }, { status: 502 });
  }
}
