/**
 * DBK144: one-time recovery of a specific failed, zero-stock product creation.
 * Default mode is READ ONLY. --apply inserts only missing zero-stock identities.
 * Run using: node --env-file=.env.local scripts/dbk144-repair-pending-product.mjs
 * Then:      node --env-file=.env.local scripts/dbk144-repair-pending-product.mjs --apply
 *
 * Never updates or deletes a stock row, creates a movement, or changes payments.
 * Leaves the catalogue product unavailable until staff verify and enable it.
 */
import { createClient } from '@sanity/client';
import { neon } from '@neondatabase/serverless';

const productId = 'product.9cea0ad34a84458383bbe5c41b243928';
const expectedProductName = 'extra large boho beads';
const pinnedHost = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const apply = process.argv.slice(2).includes('--apply');
if (process.argv.slice(2).some(arg => arg !== '--apply')) {
  throw new Error('Only --apply is supported. Omit it for read-only preflight.');
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

const dbUrl = requireEnv('DATABASE_URL');
const url = new URL(dbUrl);
if (!['postgres:','postgresql:'].includes(url.protocol) ||
    url.hostname !== pinnedHost ||
    decodeURIComponent(url.pathname.slice(1)) !== 'neondb') {
  throw new Error('Database target is not the pinned production Neon endpoint; no changes made');
}
const projectId = requireEnv('NEXT_PUBLIC_SANITY_PROJECT_ID');
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const token = requireEnv('SANITY_API_WRITE_TOKEN').replace(/^['"]|['"]$/g, '');
const sanity = createClient({projectId,dataset,token,apiVersion:'2026-08-27',useCdn:false,perspective:'published'});
const sql = neon(dbUrl);
const inventoryId = `inventory.${productId}`;
const state = await sanity.fetch(`{
  "product": *[_id == $productId][0] {
    _id,_rev,name,available,dbk142CreateRequestId,"variantIds":variants[]._key
  },
  "inventory": *[_id == $inventoryId][0] {
    _id,_rev,"storeId":defaultStore._ref
  }
}`,{productId,inventoryId},{cache:'no-store'});
const product = state?.product;
const inventory = state?.inventory;
if (!product || !inventory || !product._rev || !inventory._rev ||
    product.name?.trim().toLowerCase() !== expectedProductName ||
    product.available !== false ||
    !/^[0-9a-f-]{36}$/i.test(product.dbk142CreateRequestId || '') ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(inventory.storeId || '')) {
  throw new Error('Incomplete-product identity or safety checks failed; no changes made');
}
const variants = product.variantIds || [];
if (!Array.isArray(variants) || variants.length > 100 ||
    variants.some(id => !/^[A-Za-z0-9._-]{1,100}$/.test(id) ||
      id === '__UNALLOCATED__' || id === '__UNALLOCATED_VARIANT__') ||
    new Set(variants).size !== variants.length) {
  throw new Error('Saved catalogue variant identifiers are invalid; no changes made');
}
const stockKeys = variants.length ? variants : [''];
const existing = await sql`
  SELECT variant_id,location_id,on_hand,incoming
  FROM public.dbk51_stock_balances WHERE product_id=${productId}
`;
if (existing.length > 0) {
  throw new Error('Existing stock identities found for the target product. Refusing any mutation; inspect manually.');
}
const flags = await sql`
  SELECT (SELECT writes_enabled AND seed_fingerprint IS NOT NULL
          FROM public.dbk51_stock_engine_config WHERE singleton=true) AS engine_ready,
         (SELECT enabled FROM public.dbk69_inventory_config WHERE singleton=true) AS inventory_ready
`;
if (flags[0]?.engine_ready !== true || flags[0]?.inventory_ready !== true) {
  throw new Error('Neon stock engine gates are not ready; no changes made');
}
console.log(JSON.stringify({
  mode:apply?'APPLY':'READ_ONLY',
  productId,productName:product.name,variantKeys:stockKeys,
  storeId:inventory.storeId,existingStockRows:existing.length,
  desiredStockPerVariant:0,willKeepCatalogueUnavailable:true
},null,2));
if (!apply) {
  console.log('PREFLIGHT PASS. No writes performed. Review before using --apply.');
  process.exit(0);
}
// Idempotent; any concurrent registration cannot be overwritten.
// Same zero-only insert and write gates used by the DBK142 production helper.
await sql`
  INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,
     product_revision,inventory_revision,seed_fingerprint)
  SELECT ${productId},v.variant_id,${inventory.storeId},0,0,
    ${product._rev},${inventory._rev},${'dbk142-zero-create:'+productId}
  FROM public.dbk51_stock_engine_config AS cfg
  CROSS JOIN public.dbk69_inventory_config AS admin
  CROSS JOIN jsonb_array_elements_text(${JSON.stringify(stockKeys)}::jsonb) AS v(variant_id)
  WHERE cfg.singleton=true AND cfg.writes_enabled=true AND cfg.seed_fingerprint IS NOT NULL
    AND admin.singleton=true AND admin.enabled=true
  ON CONFLICT (product_id,variant_id,location_id) DO NOTHING
`;
const finalRows = await sql`
  SELECT variant_id,location_id,on_hand,incoming
  FROM public.dbk51_stock_balances WHERE product_id=${productId}
`;
const matches = finalRows.length === stockKeys.length && stockKeys.every(key =>
  finalRows.some(r => String(r.variant_id) === key && String(r.location_id) === inventory.storeId &&
    Number(r.on_hand) === 0 && Number(r.incoming) === 0));
if (!matches) throw new Error('Registration verification failed; inspect newly inserted zero rows before retrying');
console.log('REPAIR PASS: exactly '+finalRows.length+' zero-stock rows registered; all other stock and catalogue availability unchanged.');
