#!/usr/bin/env node
/* DBK-POS-26: one-product, production-pinned Sanity/Neon read-only diagnosis.
 * --apply requires exact product, store and an interactive business approval.
 * No inventory, money, reservation or sales writes are performed by this tool.
 */
import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { createClient } from '@sanity/client';
import { neon } from '@neondatabase/serverless';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

loadEnvConfig(process.cwd(), false);
const EXPECTED_PROJECT = 'g34n810u';
const EXPECTED_DATASET = 'production';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const productIdArg = args.find(x => x.startsWith('--product-id='))?.split('=').slice(1).join('=') || '';
const storeIdArg = args.find(x => x.startsWith('--store-id='))?.split('=').slice(1).join('=') || '';
const variantIdArg = args.find(x => x.startsWith('--variant-id='))?.split('=').slice(1).join('=') || '';
// DBK-POS-26.1 PINNED SILVER VARIANT: no other product, store, or variant can be enabled.
const PINNED_PRODUCT = 'product.3c8594a8377849d98f4bbc23b86bd811';
const PINNED_STORE = 'storeLocation.4fcbd28b74494e7da7176525e63d73f4';
const PINNED_VARIANT = '6291c4e4-317';
const projectId = (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '').trim();
const dataset = (process.env.NEXT_PUBLIC_SANITY_DATASET || 'production').trim();
if (projectId !== EXPECTED_PROJECT || dataset !== EXPECTED_DATASET) {
  throw new Error('PRODUCTION_SANITY_PIN_MISMATCH: refusing to inspect or update another project');
}
const token = (process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const client = createClient({projectId, dataset, apiVersion:'2026-08-27', useCdn:false,
  ...(token ? {token} : {}), perspective:'published'});
const writeToken = (process.env.SANITY_API_WRITE_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const live = await client.fetch(`*[_type == 'product' && defined(name)][0...500]{
  _id,_rev,name,sku,"slug":slug.current,price,available,posEnabled,ecommerceEnabled,
  "variants":variants[]{_key,title,colour,size,sku,stockQuantity}
}`, {}, {cache:'no-store'});
const normalized = value => String(value || '').toLowerCase().trim();
const silver = v => [v.title,v.colour,v.size,v.sku].some(x => /silver/i.test(String(x || '')));
const targets = live.filter(p => productIdArg ? p._id === productIdArg :
  /3\s*in\s*1/i.test(p.name) && /mirror/i.test(p.name));
if (!targets.length) throw new Error('MIRROR_NOT_FOUND: no matching published products; check exact product ID in Sanity. No writes made.');
const useNeon = process.env.DBK_INVENTORY_BACKEND === 'neon';
let sql;
if (useNeon) {
  const configured = process.env.DATABASE_URL || '';
  const expected = process.env.DBK69_EXPECTED_NEON_HOST || '';
  if (!configured || !expected || new URL(configured).hostname !== expected || !expected.endsWith('.neon.tech'))
    throw new Error('NEON_INVENTORY_PIN_MISSING: cannot verify authoritative stock. No writes made.');
  sql = neon(configured);
}
const details = [];
for (const product of targets) {
  const inventory = await client.fetch(`*[_type == 'inventoryRecord' && product._ref == $id][0]{
    _id,reserved,"balances":locationBalances[]{"storeId":coalesce(store._ref,storeId),
      "storeName":coalesce(store->name,storeName),onHand,
      "variants":variants[]{variantId,variantLabel,onHand}}
  }`, {id:product._id}, {cache:'no-store'});
  const neonRows = useNeon ? await sql`
    SELECT product_id,variant_id,location_id,on_hand FROM public.dbk51_stock_balances WHERE product_id=${product._id}
  ` : [];
  const silverVariants = (product.variants || []).filter(silver);
  const stockAt = (id, storeId) => useNeon
    ? Number(neonRows.find(r => r.variant_id === id && r.location_id === storeId)?.on_hand || 0)
    : Number((inventory?.balances || []).find(b => b.storeId === storeId)?.variants?.find(v => v.variantId === id)?.onHand || 0);
  const stores = useNeon
    ? [...new Set(neonRows.filter(r => r.location_id !== '__UNALLOCATED__').map(r => r.location_id))].map(storeId => ({storeId,storeName:storeId}))
    : (inventory?.balances || []).map(b => ({storeId:b.storeId,storeName:b.storeName || b.storeId}));
  const byStore = stores.map(store => ({storeId:store.storeId, name:store.storeName,
    silverVariants:silverVariants.map(v => ({variantId:v._key, sku:v.sku, silverStoreOnHand:stockAt(v._key,store.storeId)}))}));
  const blockers = [];
  if (product.posEnabled === false) blockers.push('PRODUCT_POS_DISABLED');
  if (product.available === false) blockers.push('PRODUCT_AVAILABLE_FALSE');
  if (!product.slug || !(Number(product.price) > 0)) blockers.push('MISSING_SLUG_OR_PRICE');
  if (!silverVariants.length) blockers.push('NO_PUBLISHED_SILVER_VARIANT');
  if (silverVariants.some(v => !v._key)) blockers.push('SILVER_VARIANT_KEY_MISSING');
  if ((Number(inventory?.reserved) || 0) > 0) blockers.push('RESERVED_STOCK_REQUIRES_REVIEW');
  if (!byStore.some(s => s.silverVariants.some(v => v.silverStoreOnHand > 0))) blockers.push('SILVER_NOT_STOCKED_IN_ANY_STORE');
  details.push({id:product._id,name:product.name,sku:product.sku,price:product.price,
    available:product.available!==false,posEnabled:product.posEnabled!==false,
    authoritativeStock:useNeon?'MAIN_NEON':'SANITY_STORE_INVENTORY',
    reserved:Number(inventory?.reserved || 0),silverVariants:silverVariants.map(v=>({id:v._key,title:v.title,colour:v.colour,sku:v.sku,companyStock:Number(v.stockQuantity || 0)})),
    stores:byStore,blockers});
}
console.log(JSON.stringify({mode:apply?'OPERATOR_APPROVED_FLAG_REPAIR':'READ_ONLY',
  project:'Decor By Kasiwa production', matches:details, inventoryWrites:0, paymentWrites:0},null,2));
if (!apply) {
  console.log('NEXT: Search Silver in POS after installing the UI patch. Only if a visibility flag is false AND the exact store has Silver stock, use --apply with --product-id and --store-id.');
  process.exit(0);
}
if (!productIdArg || !storeIdArg || !variantIdArg) throw new Error('APPLY_REQUIRES_EXACT_PRODUCT_STORE_AND_VARIANT');
if (productIdArg !== PINNED_PRODUCT || storeIdArg !== PINNED_STORE || variantIdArg !== PINNED_VARIANT)
  throw new Error('APPLY_PIN_MISMATCH: only OTC Mall Round Head Silver is authorized by this script');
if (targets.length !== 1 || details.length !== 1) throw new Error('APPLY_AMBIGUOUS_PRODUCT');
const d = details[0], p = targets[0];
if (!d.silverVariants.some(v => v.id === variantIdArg && /round head silver/i.test(v.title) && v.companyStock > 0))
  throw new Error('APPLY_BLOCKED_EXACT_VARIANT_MISSING_OR_NOT_STOCKED');
if (p.posEnabled === false) throw new Error('APPLY_BLOCKED_POS_DISABLED_OUT_OF_SCOPE');
const matchStore = d.stores.find(s => s.storeId === storeIdArg);
if (!matchStore?.silverVariants.some(v => v.variantId === variantIdArg && v.silverStoreOnHand > 0))
  throw new Error('APPLY_BLOCKED_NO_EXACT_VARIANT_STOCK_AT_OTC');
if (!p.slug || !(Number(p.price) > 0) || Number(d.reserved) > 0) throw new Error('APPLY_BLOCKED_CATALOGUE_OR_RESERVATION');
if (d.blockers.some(b => ['NO_PUBLISHED_SILVER_VARIANT','SILVER_VARIANT_KEY_MISSING','MISSING_SLUG_OR_PRICE'].includes(b)))
  throw new Error('APPLY_BLOCKED_INVALID_PRODUCT');
const changes = {};
if (p.available === false) changes.available = true;
// POS was already enabled; do not modify posEnabled or any other field.
if (!Object.keys(changes).length) {
  console.log('ALREADY_ENABLED: No catalogue flag changes necessary. Inspect selected POS store and variant search; stock was not changed.');
  process.exit(0);
}
if (!writeToken) throw new Error('SANITY_API_WRITE_TOKEN_MISSING: no write attempted');
console.log('CAUTION: available=true applies to the ENTIRE product (including storefront visibility). Zero-stock variants remain blocked by checkout stock checks.');
console.log('Flags to change:',Object.keys(changes).join(', '));
const rl = createInterface({input,output});
const expected=`ENABLE SILVER POS ${p.sku}`;
let approval;
try { approval = await rl.question(`Type ${expected} to enable POS visibility for this exact product: `); }
finally { rl.close(); }
if (approval !== expected) throw new Error('NOT_APPROVED: no changes made');
const writer = createClient({projectId,dataset,apiVersion:'2026-08-27',useCdn:false,token:writeToken,perspective:'published'});
// Recheck the exact location/variant immediately before changing visibility.
const refreshed = await client.fetch(`*[_type == 'inventoryRecord' && product._ref == $id][0]{
  reserved, "balances":locationBalances[]{"storeId":coalesce(store._ref,storeId),
  "variants":variants[]{variantId,onHand}}
}`, {id:p._id}, {cache:'no-store'});
if (Number(refreshed?.reserved || 0) > 0) throw new Error('APPLY_ABORTED_NEW_RESERVATION');
if (!useNeon) {
  const qty = refreshed?.balances?.find(b => b.storeId === PINNED_STORE)?.variants?.find(v => v.variantId === PINNED_VARIANT)?.onHand;
  if (!(Number(qty) > 0)) throw new Error('APPLY_ABORTED_STORE_STOCK_CHANGED');
} else {
  const rows = await sql`SELECT on_hand FROM public.dbk51_stock_balances
      WHERE product_id=${PINNED_PRODUCT} AND variant_id=${PINNED_VARIANT} AND location_id=${PINNED_STORE}`;
  if (!(Number(rows[0]?.on_hand) > 0)) throw new Error('APPLY_ABORTED_NEON_STORE_STOCK_CHANGED');
}
await writer.patch(p._id).ifRevisionId(p._rev).set(changes).commit();
console.log(`FLAGS_UPDATED=YES; PRODUCT=${p._id}; FIELDS=${Object.keys(changes).join(',')}; STOCK_CHANGED=NO; NO_PAYMENTS=YES`);
