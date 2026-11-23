import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import { dbk69InventoryEnabled, dbk69ProductBalances } from './dbk69-inventory-neon';

export async function dbk120ValidateVariantReadiness(productId: string, variantIds: string[]) {
  if (!dbk69InventoryEnabled()) throw new Error('Neon inventory authority is not enabled');
  const balances = await dbk69ProductBalances(productId);
  const desired = new Set(variantIds);
  if (balances.some(row => row.variant_id !== '' &&
      row.variant_id !== '__UNALLOCATED_VARIANT__' && !desired.has(row.variant_id))) {
    throw new Error('Existing Neon variant identifiers cannot be removed');
  }
  if (balances.some(row => row.variant_id === '__UNALLOCATED_VARIANT__' &&
      (Number(row.on_hand)>0 || Number(row.incoming)>0))) {
    throw new Error('Quarantined stock requires reviewed reconciliation before variants can change');
  }
  const alreadyVariantManaged = balances.some(row => row.variant_id !== '' && row.variant_id !== '__UNALLOCATED_VARIANT__');
  const nonvariant = balances.filter(row => row.variant_id === '');
  if (nonvariant.length) {
    if (nonvariant.some(row => Number(row.on_hand)>0 || Number(row.incoming)>0)) {
      throw new Error('This product has non-variant stock. Move or allocate those units before converting to variants.');
    }
    // Historical non-variant operations prohibit the INITIAL conversion.
    // They do not prohibit registering an additional zero-stock variant once
    // real variant keys are already registered and all non-variant balances
    // are zero. The database function enforces this same rule under a lock.
    if (!alreadyVariantManaged) {
      const [record] = await getNeonSql()`
        SELECT count(*)::integer AS used FROM public.dbk51_stock_operations
        WHERE product_id=${productId} AND variant_id=''
      `;
      if (Number(record?.used || 0)>0) {
        throw new Error('This product has historical stock transactions. Converting its stock identifier requires a reviewed migration.');
      }
    }
  }
  return {existingRows:balances.length,conversion:nonvariant.length>0};
}

export async function dbk120RegisterCatalogueVariants(productId: string, variantIds: string[]) {
  if (!dbk69InventoryEnabled()) throw new Error('Neon inventory authority is not enabled');
  if (!variantIds.length || variantIds.length > 100 ||
      variantIds.some(id => !/^[A-Za-z0-9._-]{1,100}$/.test(id) ||
        id === '__UNALLOCATED_VARIANT__' || id === '__UNALLOCATED__') ||
      new Set(variantIds).size !== variantIds.length) {
    throw new Error('Invalid catalogue variant keys');
  }
  // dbk69ProductBalances also pins the expected production Neon host.
  await dbk69ProductBalances(productId);
  const rows = await getNeonSql()`
    SELECT public.dbk120_register_catalogue_variants(${productId},${JSON.stringify(variantIds)}::jsonb) AS result
  `;
  if (!rows[0]?.result) throw new Error('Variant registration returned no result');
  const verified = await dbk69ProductBalances(productId);
  if (variantIds.some(id => !verified.some(row => row.variant_id === id))) {
    throw new Error('Variant catalogue saved, but Neon zero-stock registration is incomplete');
  }
  return rows[0].result;
}
