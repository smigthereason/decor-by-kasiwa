import { NextResponse } from "next/server";

import { getActiveDeliveryZones } from "@/lib/shipping-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const deliveryZones = await getActiveDeliveryZones();
    return NextResponse.json({ deliveryZones });
  } catch (cause) {
    console.error("Unable to load delivery options:", cause);
    return NextResponse.json({ message: "Unable to load delivery options." }, { status: 500 });
  }
}
