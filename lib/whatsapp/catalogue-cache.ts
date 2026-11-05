import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import { catalogueItem, type CatalogueItem } from './browse-core';
import { classifyCatalogueFreshness } from './catalogue-freshness';

const KEY = 'ecommerce';

/** Refresh explicitly via authenticated backoffice route, never during customer messages. */
export async function refreshWhatsAppCatalogue(): Promise<{count:number; categories:number; syncedAt:string}> {
  const { getStoreProducts } = await import('@/sanity/lib/catalog');
  const source = await getStoreProducts('ecommerce'); // Sanity READ only
  if (!Array.isArray(source) || source.length === 0) throw new Error('Source catalogue empty; keeping existing cache');
  const seen = new Set<string>();
  const products: CatalogueItem[] = [];
  for (const raw of source) {
    const item = catalogueItem(raw);
    if (item && !seen.has(item.id)) { products.push(item); seen.add(item.id); }
  }
  if (!products.length) throw new Error('No eligible products; keeping existing cache');
  if (products.length > 20000) throw new Error('Catalogue exceeds DBK-36 safety limit');
  const sql = getNeonSql();
  const payload = JSON.stringify(products);
  // One atomic replacement; never delete cache on a failed Sanity fetch.
  const rows = await sql`
    INSERT INTO public.dbk36_wa_catalogue_cache (cache_key, products_json, synced_at)
    VALUES (${KEY}, ${payload}::jsonb, now())
    ON CONFLICT (cache_key) DO UPDATE
      SET products_json=EXCLUDED.products_json, synced_at=EXCLUDED.synced_at
    RETURNING synced_at`;
  return {count:products.length, categories:new Set(products.map(p=>p.category)).size,
    syncedAt:String(rows[0].synced_at)};
}

/**
 * Customer reads never contact Sanity. The test environment tolerates a bounded
 * stale cache while the scheduled sync recovers. Stale data cannot be treated as
 * live stock or guaranteed prices, and older/invalid snapshots fail closed.
 */
export async function readWhatsAppCatalogue(): Promise<{
  products: CatalogueItem[]; fresh: boolean; stale: boolean;
}> {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT products_json, synced_at FROM public.dbk36_wa_catalogue_cache
    WHERE cache_key=${KEY} LIMIT 1`;
  const row = rows[0];
  if (!row || !Array.isArray(row.products_json)) {
    return { products: [], fresh: false, stale: false };
  }
  const envMinutes = (name: string, fallback: number, minimum: number) => {
    const raw = process.env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    return Number.isFinite(value) ? Math.max(minimum, Math.min(1440, Math.floor(value))) : fallback;
  };
  const freshMinutes = envMinutes('DBK36_CATALOGUE_MAX_AGE_MINUTES', 60, 1);
  const graceMinutes = envMinutes('DBK36_CATALOGUE_STALE_GRACE_MINUTES', 360, 0);
  const status = classifyCatalogueFreshness(String(row.synced_at), Date.now(), freshMinutes, graceMinutes);
  if (status === 'expired') return { products: [], fresh: false, stale: false };
  const products = (row.products_json as unknown[]).map(catalogueItem)
    .filter((p): p is CatalogueItem => p !== null);
  if (!products.length) return { products: [], fresh: false, stale: false };
  return { products, fresh: status === 'fresh', stale: status === 'stale' };
}
