import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";
import {
  DEFAULT_DELIVERY_ZONES,
  normalizeDeliveryZones,
  type DeliveryZone,
} from "@/lib/shipping";

export async function getConfiguredDeliveryZones(): Promise<DeliveryZone[]> {
  const zones = await serverClient.fetch<unknown>(
    `*[_type == "siteSettings" && _id == "siteSettings"][0].deliveryZones`,
    {},
    { cache: "no-store" },
  );

  const normalized = normalizeDeliveryZones(zones);
  return normalized.length ? normalized : DEFAULT_DELIVERY_ZONES;
}

export async function getActiveDeliveryZones(): Promise<DeliveryZone[]> {
  return (await getConfiguredDeliveryZones()).filter((zone) => zone.active);
}

export async function getDeliveryZoneById(id?: string | null) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) return null;
  const zones = await getActiveDeliveryZones();
  return zones.find((zone) => zone.id === normalizedId) || null;
}
