export type DeliveryZone = {
  id: string;
  label: string;
  description?: string;
  fee: number;
  active: boolean;
};

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: "within-nairobi",
    label: "Within Nairobi",
    description: "Standard delivery within Nairobi.",
    fee: 300,
    active: true,
  },
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

    if (!id || !label || seen.has(id) || !Number.isFinite(fee) || fee < 0) continue;
    seen.add(id);
    zones.push({ id, label, description: description || undefined, fee, active });
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
