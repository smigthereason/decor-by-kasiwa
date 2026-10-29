// Pure stock display mapper. All quantities come from Neon; Sanity supplies only catalogue metadata.
export const DBK69_UNALLOCATED = '__UNALLOCATED__';
export const DBK69_QUARANTINED = '__UNALLOCATED_VARIANT__';

export type Dbk69Balance = {
  product_id: string; variant_id: string; location_id: string;
  on_hand: string | number; incoming: string | number;
};

type RawLocation = {storeId?: string;storeName?: string;storeCode?: string};
type RawVariant = {id: string;stockQuantity: number};
export type Dbk69InventoryItem = {
  id: string; onHand: number; companyOnHand?: number; incoming: number;
  unallocatedOnHand?: number; available?: boolean; location?: string;
  variants?: RawVariant[];
  locationBalances?: Array<{storeId:string;storeName:string;storeCode?:string;onHand:number;incoming:number;
    variants?: Array<{variantId:string;onHand:number;incoming:number}>}>;
};

function quantity(value: string | number): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid Neon stock balance; refusing stale inventory display');
  return n;
}

export function dbk69OverlayStock<T extends Dbk69InventoryItem>(
  item: T, rows: Dbk69Balance[], storeId?: string,
): T {
  if (!rows.length) throw new Error(`Product ${item.id} is absent from Neon stock: refusing Sanity fallback`);
  if (rows.some(r => r.product_id !== item.id)) throw new Error('Neon product stock mismatch');
  const expectedVariants = new Set((item.variants || []).map(v => v.id));
  const known = rows.filter(r => r.variant_id !== DBK69_QUARANTINED);
  if (known.some(r => expectedVariants.size ? !expectedVariants.has(r.variant_id) : r.variant_id !== '')) {
    throw new Error('Neon product variants do not match catalogue; reconciliation required');
  }
  const groups = new Map<string, {storeId:string;storeName:string;storeCode?:string;onHand:number;incoming:number;
    variants:Array<{variantId:string;onHand:number;incoming:number}>}>();
  const previous = new Map((item.locationBalances || []).map(x => [x.storeId,x] as const));
  let companyOnHand = 0, companyIncoming = 0, unallocatedOnHand = 0;
  const variantQty = new Map<string,number>();
  for (const row of known) {
    const stock = quantity(row.on_hand), incoming = quantity(row.incoming);
    companyOnHand += stock; companyIncoming += incoming;
    if (row.location_id === DBK69_UNALLOCATED) { unallocatedOnHand += stock; }
    else {
      const prior = previous.get(row.location_id);
      const g: {storeId:string;storeName:string;storeCode?:string;onHand:number;incoming:number;
        variants:Array<{variantId:string;onHand:number;incoming:number}>} = groups.get(row.location_id) || {
        storeId:row.location_id,storeName:prior?.storeName || row.location_id,
        storeCode:prior?.storeCode,onHand:0,incoming:0,variants:[]};
      g.onHand += stock; g.incoming += incoming;
      if (row.variant_id) g.variants.push({variantId:row.variant_id,onHand:stock,incoming});
      groups.set(row.location_id,g);
    }
    if (row.variant_id) variantQty.set(row.variant_id,(variantQty.get(row.variant_id) || 0)+stock);
  }
  if (![companyOnHand,companyIncoming,unallocatedOnHand].every(Number.isSafeInteger)) {
    throw new Error('Neon stock total overflow');
  }
  const scoped = storeId ? groups.get(storeId) : undefined;
  const stock = storeId ? scoped?.onHand || 0 : companyOnHand;
  return {
    ...item,
    companyOnHand,unallocatedOnHand,
    onHand:stock,
    incoming:storeId ? scoped?.incoming || 0 : companyIncoming,
    location:storeId ? scoped?.storeName || 'Assigned store' : item.location,
    available:item.available !== false && stock > 0,
    variants:(item.variants || []).map(v=>({...v,stockQuantity:storeId
      ? scoped?.variants.find(x=>x.variantId===v.id)?.onHand || 0 : variantQty.get(v.id) || 0})),
    locationBalances:Array.from(groups.values()),
  };
}
