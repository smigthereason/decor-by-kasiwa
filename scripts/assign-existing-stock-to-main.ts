/**
 * One-time, additive allocation of genuinely unallocated legacy stock to a
 * client-created MAIN location. Never reallocates stock from other stores.
 * Dry-run is the default; write requires DBK_MAIN_STOCK_WRITE=1.
 * If there is more than one MAIN location, DBK_MAIN_STORE_ID is required.
 * Run with: npx sanity exec scripts/assign-existing-stock-to-main.ts --with-user-token
 */
import { getCliClient } from "sanity/cli";

type Variant = { _key?: string; title?: string; colour?: string; size?: string; stockQuantity?: number };
type Balance = { _key?: string; store?: { _type: string; _ref: string }; storeId?: string; storeName?: string; storeCode?: string; onHand?: number; incoming?: number; variants?: Array<{ _key: string; variantId: string; variantLabel?: string; onHand: number; incoming: number }> };
type Product = { _id: string; _rev: string; name?: string; initialStock?: number; variants?: Variant[] };
type Inventory = { _id: string; _rev: string; productId: string; defaultStore?: { _ref?: string }; incoming?: number; incomingByVariant?: Array<{ variantId?: string; quantity?: number }>; locationBalances?: Balance[] };
type Store = { _id: string; name: string; code?: string };
const positive = (v: unknown) => Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
const client = getCliClient().withConfig({ apiVersion: "2026-08-27", useCdn: false, perspective: "published" });
const write = process.env.DBK_MAIN_STOCK_WRITE === "1";
const ref = (id: string) => ({ _type: "reference", _ref: id });
const idOf = (b: Balance) => b.store?._ref || b.storeId;

async function main() {
  const stores = await client.fetch<Store[]>(`*[_type == "storeLocation" && locationType == "MAIN" && active != false]{_id,name,code}`);
  const explicit = process.env.DBK_MAIN_STORE_ID?.trim();
  const store = explicit ? stores.find(s => s._id === explicit) : stores.length === 1 ? stores[0] : undefined;
  if (!store) throw new Error(`Choose an active MAIN store. Found ${stores.length}; set DBK_MAIN_STORE_ID to its Sanity document ID when ambiguous. Available: ${stores.map(s => `${s.name} (${s._id})`).join(", ")}`);
  const products = await client.fetch<Product[]>(`*[_type == "product" && !(_id in path("drafts.**"))]{_id,_rev,name,initialStock,variants[]{_key,title,colour,size,stockQuantity}}`);
  const inventories = await client.fetch<Inventory[]>(`*[_type == "inventoryRecord" && !(_id in path("drafts.**"))]{_id,_rev,"productId":product._ref,defaultStore,incoming,incomingByVariant,locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}}`);
  const grouped = new Map<string, Inventory[]>();
  for (const inv of inventories) grouped.set(inv.productId, [...(grouped.get(inv.productId) || []), inv]);
  let changed = 0, skipped = 0;
  console.log(`Mode: ${write ? "WRITE" : "DRY RUN"}; MAIN: ${store.name} (${store._id}); products: ${products.length}`);
  for (const product of products) {
    const records = grouped.get(product._id) || [];
    if (records.length > 1) { console.warn(`SKIP duplicate inventory records: ${product._id}`); skipped++; continue; }
    const inv = records[0];
    if (inv?.defaultStore?._ref && inv.defaultStore._ref !== store._id) {
      console.warn(`SKIP explicitly assigned to another store: ${product.name || product._id}`); skipped++; continue;
    }
    const balances = inv?.locationBalances || [];
    const anyOther = balances.some(b => idOf(b) !== store._id && (positive(b.onHand) > 0 || positive(b.incoming) > 0 || (b.variants || []).some(v => positive(v.onHand) > 0 || positive(v.incoming) > 0)));
    // Existing stock at other locations is retained; only unallocated company stock is assigned.
    const main = balances.find(b => idOf(b) === store._id);
    const variants = (product.variants || []).filter(v => v._key);
    const allocations = variants.map(v => {
      const total = positive(v.stockQuantity);
      const allocated = balances.reduce((sum,b) => sum + positive(b.variants?.find(x => x.variantId === v._key)?.onHand),0);
      const current = positive(main?.variants?.find(x => x.variantId === v._key)?.onHand);
      const incomingTotal = positive(inv?.incomingByVariant?.find(x => x.variantId === v._key)?.quantity);
      const incomingAllocated = balances.reduce((sum,b) => sum + positive(b.variants?.find(x => x.variantId === v._key)?.incoming),0);
      return { variant: v, onHand: current + Math.max(0,total-allocated), incoming: positive(main?.variants?.find(x => x.variantId === v._key)?.incoming) + Math.max(0,incomingTotal-incomingAllocated) };
    });
    const aggregate = variants.length ? allocations.reduce((sum,v) => sum + v.onHand,0) : positive(main?.onHand) + Math.max(0,positive(product.initialStock)-balances.reduce((sum,b) => sum + positive(b.onHand),0));
    const aggregateIncoming = variants.length ? allocations.reduce((sum,v) => sum + v.incoming,0) : positive(main?.incoming) + Math.max(0,positive(inv?.incoming)-balances.reduce((sum,b) => sum + positive(b.incoming),0));
    const nextMain: Balance = {
      _key: main?._key || `store-${store._id.replace(/[^a-zA-Z0-9]/g,"").slice(0,24)}`,
      store: ref(store._id), storeId: store._id, storeName: store.name, storeCode: store.code,
      onHand: aggregate, incoming: aggregateIncoming,
      ...(variants.length ? { variants: allocations.map(({variant,onHand,incoming}) => ({ _key: main?.variants?.find(x=>x.variantId===variant._key)?._key || `variant-${variant._key!.replace(/[^a-zA-Z0-9]/g,"").slice(0,24)}`,variantId:variant._key!,variantLabel:variant.title || [variant.colour,variant.size].filter(Boolean).join(" / "),onHand,incoming })) } : {}),
    };
    const next = [...balances.filter(b => idOf(b) !== store._id),nextMain];
    const already = inv?.defaultStore?._ref === store._id && JSON.stringify(main) === JSON.stringify(nextMain);
    if (already) { skipped++; continue; }
    console.log(`${write ? "UPDATE" : "WOULD UPDATE"} ${product.name || product._id}: ${aggregate} on hand at MAIN${anyOther ? " (other stores preserved)" : ""}`);
    changed++;
    if (!write) continue;
    const transaction = client.transaction();
    if (!inv) {
      transaction.create({ _id: `inventory.${product._id.replace(/[^a-zA-Z0-9._-]/g, "-")}`, _type: "inventoryRecord", product: ref(product._id), location: store.name, defaultStore: ref(store._id), locationBalances: next, reserved: 0, incoming: 0, reorderPoint: 5 });
    } else {
      transaction.patch(inv._id, p => p.ifRevisionId(inv._rev).set({ defaultStore: ref(store._id), location: store.name, locationBalances: next }));
    }
    await transaction.commit();
  }
  console.log(`${write ? "Updated" : "Would update"}: ${changed}; skipped: ${skipped}. No stock from another location was moved.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
