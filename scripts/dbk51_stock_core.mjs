import { createHash } from 'node:crypto';

export const UNALLOCATED = '__UNALLOCATED__';
export const UNKNOWN_VARIANT = '__UNALLOCATED_VARIANT__';

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function units(raw, label, problems, fallback = 0) {
  const value = raw === undefined || raw === null ? fallback : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    problems.push(`${label}: expected a non-negative whole number, received ${JSON.stringify(value)}`);
    return 0;
  }
  return value;
}

export function buildStockSnapshot(documents) {
  const problems = [];
  const products = new Map();
  const inventories = new Map();
  for (const d of documents) {
    if (!d || typeof d !== 'object' || typeof d._id !== 'string' || d._id.startsWith('drafts.')) continue;
    if (d._type === 'product') {
      if (products.has(d._id)) problems.push(`duplicate product ${d._id}`);
      products.set(d._id, d);
    }
    if (d._type === 'inventoryRecord') {
      const ref = d.product?._ref;
      if (!ref) { problems.push(`inventory ${d._id} has no product reference`); continue; }
      if (inventories.has(ref)) problems.push(`multiple inventory records for product ${ref}`);
      inventories.set(ref, d);
    }
  }
  const rows = [];
  const quarantinedProducts = [];
  const add = (product, inv, variant, store, onHand, incoming) => rows.push({
    product_id: product._id,
    variant_id: variant,
    location_id: store,
    on_hand: onHand,
    incoming,
    product_revision: String(product._rev || ''),
    inventory_revision: String(inv?._rev || ''),
  });
  for (const [id, inv] of inventories) {
    if (!products.has(id)) problems.push(`inventory ${inv._id} references missing product ${id}`);
  }
  for (const product of [...products.values()].sort((a, b) => a._id.localeCompare(b._id))) {
    const inv = inventories.get(product._id);
    const locs = inv?.locationBalances || [];
    if (!Array.isArray(locs)) { problems.push(`${product._id}: locationBalances is not an array`); continue; }
    const variantProduct = Array.isArray(product.variants) && product.variants.length > 0;
    const variants = variantProduct ? product.variants : [{ _key: '', stockQuantity: product.initialStock ?? 0 }];
    const variantIds = new Set();
    const allocated = new Map();
    const incomingAllocated = new Map();
    const company = new Map();
    for (const v of variants) {
      const vid = variantProduct ? v._key : '';
      if (typeof vid !== 'string' || (variantProduct && (!vid || vid === UNKNOWN_VARIANT))) {
        problems.push(`${product._id}: variant has missing/reserved key`);
        continue;
      }
      if (variantIds.has(vid)) { problems.push(`${product._id}: duplicate variant ${vid}`); continue; }
      variantIds.add(vid);
      company.set(vid, units(v.stockQuantity, `${product._id}/${vid} company onHand`, problems));
      allocated.set(vid, 0);
      incomingAllocated.set(vid, 0);
    }
    const storeSeen = new Set();
    for (const loc of locs) {
      const store = loc?.store?._ref || loc?.storeId || '';
      if (!store || store === UNALLOCATED) { problems.push(`${product._id}: invalid store reference`); continue; }
      if (storeSeen.has(store)) { problems.push(`${product._id}: duplicate location ${store}`); continue; }
      storeSeen.add(store);
      if (variantProduct) {
        const locVariants = Array.isArray(loc.variants) ? loc.variants : [];
        const seen = new Set();
        let totalH = 0, totalI = 0;
        for (const lv of locVariants) {
          const vid = lv?.variantId;
          if (!variantIds.has(vid) || seen.has(vid)) { problems.push(`${product._id}/${store}: unknown/duplicate variant ${vid}`); continue; }
          seen.add(vid);
          const h = units(lv.onHand, `${product._id}/${store}/${vid} onHand`, problems);
          const inc = units(lv.incoming, `${product._id}/${store}/${vid} incoming`, problems);
          allocated.set(vid, allocated.get(vid) + h);
          incomingAllocated.set(vid, incomingAllocated.get(vid) + inc);
          totalH += h; totalI += inc;
          add(product, inv, vid, store, h, inc);
        }
        const locH = units(loc.onHand, `${product._id}/${store} aggregate onHand`, problems);
        const locI = units(loc.incoming, `${product._id}/${store} aggregate incoming`, problems);
        if (locH !== totalH || locI !== totalI) problems.push(`${product._id}/${store}: aggregate location/variant mismatch (${locH}/${totalH} onHand, ${locI}/${totalI} incoming)`);
      } else {
        const h = units(loc.onHand, `${product._id}/${store} onHand`, problems);
        const inc = units(loc.incoming, `${product._id}/${store} incoming`, problems);
        if (Array.isArray(loc.variants) && loc.variants.some(v => (v.onHand || 0) > 0 || (v.incoming || 0) > 0)) problems.push(`${product._id}/${store}: variant quantities on nonvariant product`);
        allocated.set('', allocated.get('') + h);
        incomingAllocated.set('', incomingAllocated.get('') + inc);
        add(product, inv, '', store, h, inc);
      }
    }
    const totalIncoming = units(inv?.incoming, `${product._id} company incoming`, problems);
    const locationIncomingTotal = [...incomingAllocated.values()].reduce((a, b) => a + b, 0);
    if (totalIncoming < locationIncomingTotal) problems.push(`${product._id}: location incoming ${locationIncomingTotal} exceeds company incoming ${totalIncoming}`);
    // These units were explicitly classified as unidentified by the source system.
    // Preserve them in a reserved, non-sellable variant rather than inventing a
    // colour/size or dropping them from the migration snapshot.
    const unidentifiedOnHand = variantProduct
      ? units(inv?.unallocatedOnHand, `${product._id} unknown variant stock`, problems)
      : 0;
    if (unidentifiedOnHand > 0) {
      quarantinedProducts.push({
        productId: product._id,
        productName: String(product.name || ''),
        onHand: unidentifiedOnHand,
        inventoryRevision: String(inv?._rev || ''),
      });
    }
    for (const vid of variantIds) {
      const remainder = company.get(vid) - allocated.get(vid);
      if (remainder < 0) problems.push(`${product._id}/${vid}: allocated onHand ${allocated.get(vid)} exceeds company onHand ${company.get(vid)}`);
      add(product, inv, vid, UNALLOCATED, Math.max(0, remainder), !variantProduct ? Math.max(0, totalIncoming - locationIncomingTotal) : 0);
    }
    if (variantProduct && (unidentifiedOnHand > 0 || totalIncoming > locationIncomingTotal)) {
      // Exactly one reserved row for unknown-variant onHand and incoming.
      // dbk51_apply_stock explicitly rejects this reserved variant for ALL
      // transaction types; nothing here becomes sellable stock.
      add(product, inv, UNKNOWN_VARIANT, UNALLOCATED,
        unidentifiedOnHand, Math.max(0, totalIncoming - locationIncomingTotal));
    }
  }
  rows.sort((a, b) => `${a.product_id}\0${a.variant_id}\0${a.location_id}`.localeCompare(`${b.product_id}\0${b.variant_id}\0${b.location_id}`));
  const fingerprint = sha256(JSON.stringify(rows));
  return {
    productCount: products.size,
    inventoryRecordCount: inventories.size,
    balanceCount: rows.length,
    quantityTotals: {
      onHand: rows.reduce((n, r) => n + r.on_hand, 0),
      incoming: rows.reduce((n, r) => n + r.incoming, 0),
    },
    fingerprint,
    quantityClassification: {
      storeSellableOnHand: rows.filter(r => r.variant_id !== UNKNOWN_VARIANT && r.location_id !== UNALLOCATED)
        .reduce((sum, r) => sum + r.on_hand, 0),
      knownVariantUnallocatedOnHand: rows.filter(r => r.variant_id !== UNKNOWN_VARIANT && r.location_id === UNALLOCATED)
        .reduce((sum, r) => sum + r.on_hand, 0),
      quarantinedOnHand: rows.filter(r => r.variant_id === UNKNOWN_VARIANT)
        .reduce((sum, r) => sum + r.on_hand, 0),
    },
    quarantinedProducts,
    problems,
    safeToSeed: problems.length === 0 && products.size > 0,
    rows,
  };
}
