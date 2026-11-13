import 'server-only';
import { neon } from '@neondatabase/serverless';
import { getStoreProducts } from '@/sanity/lib/catalog';
import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { mapVerifiedPaidOrder, type PaidSource, type InventoryBalance } from '@/lib/whatsapp/production-import-core';

const STAGE_HOST = 'ep-damp-mouse-ba3xilk3-pooler.c-8.eu-central-1.aws.neon.tech';
const PROD_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const REF = /^DBKWA[A-Z0-9]{7}$/;

function configured() {
  // Staging Preview and Cloudflare never carry production-write permissions.
  if (process.env.VERCEL_ENV !== 'production' || process.env.DBK36_WA_PRODUCTION_IMPORT_ENABLED !== 'YES' ||
      process.env.DBK36_STAGING_WORKER === 'YES' || process.env.DBK36_CLOUDFLARE_DEPLOYMENT === 'YES') {
    throw new Error('PRODUCTION_IMPORT_DISABLED');
  }
  const u = new URL(process.env.DBK36_WA_STAGING_READONLY_URL || '');
  const p = new URL(process.env.DATABASE_URL || '');
  if (!['postgres:','postgresql:'].includes(u.protocol) || u.hostname!==STAGE_HOST ||
      u.pathname!=='/neondb' || u.searchParams.get('sslmode')!=='require' || !u.password ||
      !['postgres:','postgresql:'].includes(p.protocol) || p.hostname!==PROD_HOST ||
      p.pathname!=='/neondb' || !p.password) throw new Error('DATABASE_PIN_MISMATCH');
  const storeId = process.env.DBK36_WA_PRODUCTION_STORE_ID || '';
  if (!/^[A-Za-z0-9._:-]{2,180}$/.test(storeId) || storeId==='__UNALLOCATED__')
    throw new Error('PRODUCTION_STORE_ID_REQUIRED');
  return { stage: neon(u.toString()), prod: dbk62GetProductionSql(), storeId };
}

type StageRole = {username: string; privileged: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean};
async function readPaid(ref: string) {
  if (!REF.test(ref)) throw new Error('INVALID_PAYMENT_REFERENCE');
  const {stage} = configured();
  // Refuse a stage connection that can edit payment evidence.
  const role = await stage`SELECT current_user username,
    (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname=current_user) privileged,
    has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','INSERT') can_insert,
    has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','UPDATE') can_update,
    has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','DELETE') can_delete` as unknown as StageRole[];
  if (role.length !== 1 || role[0].privileged || role[0].can_insert || role[0].can_update || role[0].can_delete)
    throw new Error('STAGING_SOURCE_ROLE_NOT_READONLY');
  const rows = await stage`SELECT wa_id,reference,status,amount_kes,receipt,checkout_id,merchant_id,paid_at,cart_json
    FROM public.dbk36_wa_live_stk_pilot WHERE reference=${ref} LIMIT 1` as unknown as PaidSource[];
  if (rows.length!==1) throw new Error('PAID_ORDER_NOT_FOUND');
  return rows[0];
}

export async function listProductionWhatsAppOrders() {
  const {prod} = configured();
  const rows = await prod`SELECT reference,order_id,amount_minor,stock_status,created_at,
     right(provider_receipt,4) AS receipt_suffix
    FROM public.dbk36_wa_production_imports ORDER BY created_at DESC LIMIT 100`;
  return {orders:rows,source:'PRODUCTION_NEON_DBK56_DBK55',productionWritesPerformed:false};
}

export async function assessProductionImport(reference: string, mappings: Record<string,string> = {}) {
  const {prod,storeId} = configured();
  const paid = await readPaid(reference);
  const products = await getStoreProducts('ecommerce');
  if (!Array.isArray(products) || !products.length) throw new Error('AUTHORITATIVE_CATALOGUE_UNAVAILABLE');
  const stocks = await prod`SELECT product_id,variant_id,location_id,on_hand FROM public.dbk51_stock_balances
     WHERE location_id=${storeId} LIMIT 10001` as unknown as InventoryBalance[];
  if (stocks.length>10000) throw new Error('STOCK_RESULT_TOO_LARGE');
  const mapped = mapVerifiedPaidOrder(paid,products,stocks,storeId,mappings);
  const receipt = paid.receipt || '';
  const existing = await prod`SELECT
    EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements WHERE payment_provider='daraja' AND provider_receipt=${receipt}) AS settlement,
    EXISTS(SELECT 1 FROM public.dbk56_pos_payments WHERE provider='daraja' AND provider_reference=${receipt}) AS ledger,
    EXISTS(SELECT 1 FROM public.dbk68_daraja_orders WHERE receipt_number=${receipt}) AS daraja,
    EXISTS(SELECT 1 FROM public.dbk36_wa_production_imports WHERE reference=${reference}) AS imported`;
  const dupe = existing[0] as Record<string,boolean>;
  const blockers = mapped.ok?[]:[...mapped.blockers];
  if (dupe.settlement||dupe.ledger||dupe.daraja||dupe.imported) blockers.push('ALREADY_IN_PRODUCTION');
  return {reference,receiptSuffix:receipt.slice(-4),amountKes:Number(paid.amount_kes),
    storeId,alreadyImported:dupe.imported,blockers,lines:mapped.ok?mapped.lines:[],
    productionWritesPerformed:false,requiresIndependentTillReconciliation:true};
}

/** Deliberately operator-approved import. No STK charge, WhatsApp reply, or staging write. */
export async function importPaidToProduction(input: {
  reference: string; fullReceipt: string; confirmation: string; mappedVariants?: Record<string,string>;
  fulfillment: 'collection';
}, actor: {customerId: string; customerEmail: string}) {
  const {prod,storeId} = configured();
  if (!REF.test(input.reference) || input.confirmation !== `IMPORT ${input.reference}` ||
      input.fulfillment!=='collection' || !actor.customerId || !actor.customerEmail) {
    throw new Error('MANAGER_APPROVAL_REQUIRED');
  }
  const paid = await readPaid(input.reference);
  const existing = await prod`SELECT order_id,checkout_id,provider_receipt,stock_status
    FROM public.dbk36_wa_production_imports WHERE reference=${input.reference}`;
  if (existing.length) {
    const prev = existing[0];
    if (prev.provider_receipt!==paid.receipt || prev.checkout_id!==paid.checkout_id ||
        input.fullReceipt!==paid.receipt) throw new Error('CONFLICTING_PRODUCTION_REPLAY');
    return {orderId:String(prev.order_id),financialStatus:'PAID',
      stockStatus:String(prev.stock_status),replayed:true};
  }
  if (input.fullReceipt !== paid.receipt) throw new Error('MERCHANT_RECEIPT_CONFIRMATION_MISMATCH');
  const products = await getStoreProducts('ecommerce');
  if (!Array.isArray(products) || !products.length) throw new Error('AUTHORITATIVE_CATALOGUE_UNAVAILABLE');
  const balances = await prod`SELECT product_id,variant_id,location_id,on_hand FROM public.dbk51_stock_balances
    WHERE location_id=${storeId} LIMIT 10001` as unknown as InventoryBalance[];
  if (balances.length>10000) throw new Error('STOCK_RESULT_TOO_LARGE');
  const mapped = mapVerifiedPaidOrder(paid,products,balances,storeId,input.mappedVariants||{});
  if (!mapped.ok) throw new Error('ORDER_MAPPING_BLOCKED:' + mapped.blockers.join(','));
  // Recheck paid evidence and receipt against caller-provided acknowledgement.
  // Human reconciliation must be performed against the business Till independently;
  // the staging row alone is not bank-grade evidence of settlement.
  const proof = {reference:paid.reference,checkoutId:paid.checkout_id,
    merchantId:paid.merchant_id,receipt:paid.receipt,amountMinor:mapped.amountMinor,
    paidAt:new Date(paid.paid_at!).toISOString(),waId:paid.wa_id,
    verificationMode:'manual_business_till_reconciliation',attestedBy:actor.customerId};
  const order = {storeId,sellerId:actor.customerId,channel:'ONLINE',
    deliveryMinor:0,discountMinor:0,items:mapped.lines};
  const rows = await prod`SELECT public.dbk36_wa_import_verified_order(
    ${JSON.stringify(proof)}::jsonb,${JSON.stringify(order)}::jsonb) AS result`;
  const result = rows[0]?.result as {orderId?:string;financialStatus?:string;stockStatus?:string;replayed?:boolean}|undefined;
  if (!result || result.financialStatus!=='PAID' ||
      !['COMMITTED','REVIEW_REQUIRED'].includes(result.stockStatus||''))
    throw new Error('PRODUCTION_POST_REQUIRES_RECONCILIATION');
  return result;
}
