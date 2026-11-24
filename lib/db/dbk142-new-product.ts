import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import { requirePinnedInventoryDatabase } from '@/lib/db/dbk69-inventory-neon';
import { dbk142ZeroStockKeys } from './dbk142-new-product-core';

/**
 * DBK-142: Register a newly created catalogue item's ZERO stock identities.
 * It never alters existing balances, stock operations, movement history or payments.
 * Catalogue publication happens only after the caller verifies registration.
 */
export async function dbk142RegisterZeroStockProduct(input: {
  productId:string;locationId:string;variantIds:string[];
  productRevision:string;inventoryRevision:string;
}) {
  if (!/^product\.[0-9a-f]{32}$/i.test(input.productId) ||
      !input.productRevision || !input.inventoryRevision ||
      process.env.DBK_INVENTORY_BACKEND !== 'neon' ||
      process.env.DBK69_INVENTORY_ADMIN !== 'enabled') {
    throw new Error('DBK142_ZERO_REGISTRATION_NOT_AUTHORIZED');
  }
  const variantIds = dbk142ZeroStockKeys({
    storeLocationId:input.locationId,variantIds:input.variantIds,
    initialStock:0,incoming:0,variantStock:[],
  });
  requirePinnedInventoryDatabase();
  const sql = getNeonSql();
  // One atomic SQL statement: all requested identities are seeded with zero.
  // ON CONFLICT DO NOTHING is deliberate: a retry never overwrites live stock.
  await sql`
    INSERT INTO public.dbk51_stock_balances
      (product_id,variant_id,location_id,on_hand,incoming,
       product_revision,inventory_revision,seed_fingerprint)
    SELECT ${input.productId},v.variant_id,${input.locationId},0,0,
      ${input.productRevision},${input.inventoryRevision},${'dbk142-zero-create:' + input.productId}
    FROM public.dbk51_stock_engine_config AS cfg
    CROSS JOIN public.dbk69_inventory_config AS admin
    CROSS JOIN jsonb_array_elements_text(${JSON.stringify(variantIds)}::jsonb) AS v(variant_id)
    WHERE cfg.singleton = true AND cfg.writes_enabled = true
      AND cfg.seed_fingerprint IS NOT NULL AND admin.singleton = true AND admin.enabled = true
    ON CONFLICT (product_id,variant_id,location_id) DO NOTHING
  `;
  const rows = await sql`
    SELECT variant_id,location_id,on_hand,incoming
    FROM public.dbk51_stock_balances WHERE product_id=${input.productId}
  `;
  const stored = new Set(rows.map(row => `${String(row.variant_id)}\u0000${String(row.location_id)}`));
  if (rows.length !== variantIds.length ||
      variantIds.some(id => !stored.has(`${id}\u0000${input.locationId}`))) {
    throw new Error('DBK142_ZERO_REGISTRATION_MISMATCH');
  }
  return {registered:variantIds.length};
}
