import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { getLiveOperationsSnapshot } from "@/lib/operations/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);

  if (!staff.ok) {
    return NextResponse.json(
      { message: staff.status === 401 ? "Authentication required." : "Access denied." },
      { status: staff.status },
    );
  }

  try {
    const scopeStoreId = (staff.role === "MANAGER" || staff.role === "STORE_STAFF") ? staff.storeLocationId || undefined : undefined;
    const snapshot = await getLiveOperationsSnapshot(scopeStoreId);
    const hideProcurement = staff.role === "MANAGER" || staff.role === "STORE_STAFF";

    // Store roles need operational data but not the full customer directory.
    const payload = {
      ...snapshot,
      viewerRole: staff.role,
      viewerStoreId: staff.storeLocationId || "",
      viewerStoreName: staff.storeLocationName || "",
      products: hideProcurement ? snapshot.products.map((product) => ({
        ...product,
        unitCost: 0,
        ...(staff.storeLocationId ? {
          companyOnHand: undefined,
          unallocatedOnHand: undefined,
          // Keep only the assigned branch balance so Manager/Sales Staff inventory
          // screens can render the scoped stock without exposing other stores.
          locationBalances: (product.locationBalances || []).filter((balance) => balance.storeId === staff.storeLocationId),
        } : {}),
      })) : snapshot.products,
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
