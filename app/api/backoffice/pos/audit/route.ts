import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getAuditTrail } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  return NextResponse.json({ audit: await getAuditTrail() });
}
