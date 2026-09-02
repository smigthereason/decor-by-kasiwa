import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import {
  DEFAULT_DELIVERY_ZONES,
  makeDeliveryZoneId,
  normalizeDeliveryZones,
  type DeliveryZone,
} from "@/lib/shipping";
import { getConfiguredDeliveryZones } from "@/lib/shipping-server";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    return NextResponse.json({ deliveryZones: await getConfiguredDeliveryZones() });
  } catch (cause) {
    console.error("Unable to load delivery pricing:", cause);
    return NextResponse.json({ message: "Unable to load delivery pricing." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const body = (await request.json()) as { deliveryZones?: unknown };
    if (!Array.isArray(body.deliveryZones)) {
      return NextResponse.json({ message: "Delivery zones must be provided as a list." }, { status: 400 });
    }

    const prepared = body.deliveryZones.map((entry, index) => {
      if (!entry || typeof entry !== "object") return entry;
      const row = entry as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      return {
        ...row,
        id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : makeDeliveryZoneId(label, index),
      };
    });
    const zones = normalizeDeliveryZones(prepared);

    if (prepared.length !== zones.length) {
      return NextResponse.json(
        { message: "Each delivery zone needs a name, a unique ID and a delivery fee of zero or more." },
        { status: 400 },
      );
    }

    if (zones.length === 0) {
      return NextResponse.json({ message: "Keep at least one delivery zone." }, { status: 400 });
    }

    if (!zones.some((zone) => zone.active)) {
      return NextResponse.json({ message: "At least one delivery zone must be active for checkout." }, { status: 400 });
    }

    const labelKeys = zones.map((zone) => zone.label.toLowerCase());
    if (new Set(labelKeys).size !== labelKeys.length) {
      return NextResponse.json({ message: "Delivery zone names must be unique." }, { status: 400 });
    }

    const sanityZones = zones.map((zone, index): DeliveryZone & { _key: string; _type: "object" } => ({
      _key: `${zone.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${index}`.slice(0, 96),
      _type: "object",
      ...zone,
    }));

    const transaction = serverClient.transaction();
    transaction.createIfNotExists({
      _id: "siteSettings",
      _type: "siteSettings",
      brandName: "Decor by Kasiwa",
    });
    transaction.patch("siteSettings", (patch) =>
      patch.set({ deliveryZones: sanityZones }),
    );
    await transaction.commit();

    return NextResponse.json({ ok: true, deliveryZones: zones.length ? zones : DEFAULT_DELIVERY_ZONES });
  } catch (cause) {
    console.error("Unable to save delivery pricing:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Unable to save delivery pricing." }, { status: 500 });
  }
}
