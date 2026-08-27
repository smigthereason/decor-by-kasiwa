import { NextResponse } from "next/server";

import { activity, inventory, orders, shipments } from "@/lib/operations/data";
import { adminMetrics, storeMetrics } from "@/lib/operations/selectors";

export async function GET() {
  return NextResponse.json({
    admin: adminMetrics(),
    store: storeMetrics(),
    orders,
    shipments,
    inventory,
    activity,
    source: "demo-domain",
  });
}
