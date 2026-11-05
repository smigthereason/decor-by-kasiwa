import 'server-only';

import { createClient } from '@sanity/client';
import {
  DEFAULT_DELIVERY_ZONES,
  normalizeDeliveryZones,
  type DeliveryZone,
} from '@/lib/shipping';

/**
 * DBK-36: Read-only delivery configuration.
 *
 * Does not import the privileged Sanity server client.
 * Does not use SANITY_API_WRITE_TOKEN.
 * Does not create, patch or delete Sanity documents.
 */
export async function getWhatsAppDeliveryZones(): Promise<DeliveryZone[]> {
  const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

  if (!projectId || !dataset) {
    throw new Error('Public Sanity reader configuration is missing');
  }

  const client = createClient({
    projectId,
    dataset,
    apiVersion: '2025-02-19',
    useCdn: false,
    token: undefined,
    perspective: 'published',
  });

  const raw = await client.fetch<unknown>(
    `*[_type == "siteSettings" && _id == "siteSettings"][0].deliveryZones`,
    {},
    { cache: 'no-store' },
  );

  const normalized = normalizeDeliveryZones(raw);

  const legacySingleRate =
    normalized.length === 1 &&
    normalized[0]?.id === 'within-nairobi' &&
    normalized[0]?.fee === 300;

  const zones =
    normalized.length > 0 && !legacySingleRate
      ? normalized
      : DEFAULT_DELIVERY_ZONES;

  return zones.filter((zone) => zone.active);
}
