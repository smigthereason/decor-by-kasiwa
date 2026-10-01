export type DeliveryZone = {
  id: string;
  label: string;
  description?: string;
  fee: number;
  active: boolean;
  quoteRequired?: boolean;
};

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { id: "shop-pickup", label: "Shop pickup", description: "Collect from the Decor by Kasiwa shop.", fee: 0, active: true },
  { id: "within-cbd", label: "Within CBD", description: "Delivery within Nairobi CBD.", fee: 100, active: true },
  { id: "outside-cbd-matatu", label: "Outside CBD via Matatu", description: "Matatu delivery outside the CBD.", fee: 150, active: true },
  { id: "long-distance-matatu", label: "Long Distance Matatu", description: "Long-distance matatu delivery within Kenya.", fee: 350, active: true },
  { id: "neighbouring-countries", label: "Neighbouring Countries", description: "Regional delivery to neighbouring countries.", fee: 1000, active: true },
  { id: "international", label: "International", description: "Delivery charge is confirmed separately before payment.", fee: 0, active: true, quoteRequired: true },
];

export function normalizeDeliveryZones(value: unknown): DeliveryZone[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const zones: DeliveryZone[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const description = typeof row.description === "string" ? row.description.trim() : "";
    const fee = Number(row.fee);
    const active = row.active !== false;
    const quoteRequired = row.quoteRequired === true;

    if (!id || !label || seen.has(id) || !Number.isFinite(fee) || fee < 0) continue;
    seen.add(id);
    zones.push({ id, label, description: description || undefined, fee, active, ...(quoteRequired ? { quoteRequired: true } : {}) });
  }

  return zones;
}

export function makeDeliveryZoneId(label: string, fallbackIndex = 0) {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `delivery-zone-${fallbackIndex + 1}`;
}
