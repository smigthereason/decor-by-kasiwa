import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getLiveOperationsSnapshot } from "@/lib/operations/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "STORE_STAFF"]);

  if (!staff.ok) {
    return NextResponse.json(
      { message: staff.status === 401 ? "Authentication required." : "Access denied." },
      { status: staff.status },
    );
  }

  try {
    const snapshot = await getLiveOperationsSnapshot();

    // Store roles need operational data but not the full customer directory.
    const payload = {
      ...snapshot,
      viewerRole: staff.role,
      customers: staff.role === "ADMIN" ? snapshot.customers : [],
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load live back-office data:", error);
    return NextResponse.json(
      { message: "Live operational data could not be loaded from Sanity." },
      { status: 500 },
    );
  }
}
