import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { findPosCustomers } from "@/lib/auth/sanity-users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Unauthorized." }, { status: staff.status });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  try {
    return NextResponse.json({ customers: await findPosCustomers(query) });
  } catch (cause) {
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to search customers." }, { status: 400 });
  }
}
