import 'server-only';
import { neon } from '@neondatabase/serverless';

const MAIN_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const STAGE_HOST='ep-damp-mouse-ba3xilk3-pooler.c-8.eu-central-1.aws.neon.tech';
const REF=/^DBKWA[A-Z0-9]{7}$/;
const RECEIPT=/^[A-Za-z0-9-]{6,30}$/;

function checkedUrl(raw:string|undefined,host:string):string {
  if (!raw) throw new Error('DATABASE_SECRET_MISSING');
  let u:URL;
  try {u=new URL(raw);} catch {throw new Error('DATABASE_SECRET_INVALID');}
  if (!['postgres:','postgresql:'].includes(u.protocol) || u.hostname!==host ||
      u.pathname!=='/neondb' || !u.password || u.searchParams.get('sslmode')!=='require')
    throw new Error('DATABASE_PIN_MISMATCH');
  return raw;
}
function dbs() {
  // Does NOT require or modify DBK62 cutover. This writes only its own intake table.
  if (process.env.VERCEL_ENV!=='production' ||
      process.env.DBK36_WA_PAID_INTAKE_ENABLED!=='YES' ||
      process.env.DBK36_STAGING_WORKER==='YES') throw new Error('PAID_INTAKE_DISABLED');
  const reader=checkedUrl(process.env.DBK36_WA_STAGING_READONLY_URL,STAGE_HOST);
  if (decodeURIComponent(new URL(reader).username)!=='dbk36_paid_intake_sql_reader')
    throw new Error('STAGING_READER_ROLE_MISMATCH');
  return {
    main:neon(checkedUrl(process.env.DATABASE_URL,MAIN_HOST)),
    stage:neon(reader),
  };
}
const minor = (v:number):number => {
  const result = Math.round(v*100);
  if (!Number.isFinite(v) || !Number.isSafeInteger(result) || Math.abs(result-v*100)>0.000001)
    throw new Error('CART_CURRENCY_INVALID');
  return result;
};
export async function listRecordedWhatsAppIntakes() {
  const {main,stage}=dbs();
  const rows=await main`SELECT reference,amount_minor,intake_status,paid_at,created_at,
     right(provider_receipt,4) AS receipt_last4,right(wa_id,4) AS customer_last4
     FROM public.dbk36_wa_paid_intake ORDER BY created_at DESC LIMIT 50`;
  // Admin-only, read-only queue: nothing is automatically booked or stock-deducted.
  const legacy=await stage`SELECT reference,amount_kes,paid_at,
      right(receipt,4) AS receipt_last4,right(wa_id,4) AS customer_last4
      FROM public.dbk36_wa_live_stk_pilot WHERE status='paid'
      ORDER BY paid_at DESC LIMIT 50`;
  const exists=await stage`SELECT to_regclass('public.dbk36_wa_payment_orders') IS NOT NULL AS present`;
  const newer=exists[0]?.present ? await stage`SELECT reference,amount_kes,paid_at,
      right(receipt,4) AS receipt_last4,right(wa_id,4) AS customer_last4
      FROM public.dbk36_wa_payment_orders WHERE status='paid'
      ORDER BY paid_at DESC LIMIT 50` : [];
  const already=new Set(rows.map(x=>String(x.reference)));
  const pending=[...legacy,...newer].filter(x=>!already.has(String(x.reference)))
    .sort((a,b)=>new Date(String(b.paid_at)).getTime()-new Date(String(a.paid_at)).getTime())
    .slice(0,50);
  return {orders:rows,pending,stockDeducted:false,source:'MAIN_NEON_MANUAL_STOCK_REVIEW'};
}
export async function recordWhatsAppPaidIntake(input: {
  reference:string; receipt:string; confirmedKes:number;
  confirmation:string; merchantTillChecked:boolean;
}, staff:{customerId:string;customerEmail:string}) {
  if (!REF.test(input.reference) || !RECEIPT.test(input.receipt) ||
      !Number.isSafeInteger(input.confirmedKes) || input.confirmedKes<1 || input.confirmedKes>500 ||
      input.confirmation!==`RECONCILE ${input.reference}` || input.merchantTillChecked!==true ||
      !staff.customerId || !staff.customerEmail) throw new Error('STAFF_TILL_ATTESTATION_REQUIRED');
  const {stage,main}=dbs();
  // Reject editable staging source; it is not sufficient for independent provider proof.
  const roles=await stage`SELECT current_user username,
      (SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication
       FROM pg_roles WHERE rolname=current_user) privileged,
      has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','INSERT') can_insert,
      has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','UPDATE') can_update,
      has_table_privilege(current_user,'public.dbk36_wa_live_stk_pilot','DELETE') can_delete`;
  const role=roles[0];
  if (!role || role.privileged || role.can_insert || role.can_update || role.can_delete)
    throw new Error('STAGING_SOURCE_NOT_READONLY');
  // v12 reads either the old immutable pilot transaction OR a new independent checkout.
  // Never query the v12 table until it exists, so v7 keeps functioning before rollout.
  let rows=await stage`SELECT reference,wa_id,status,amount_kes,receipt,
     checkout_id,merchant_id,paid_at,cart_json
     FROM public.dbk36_wa_live_stk_pilot WHERE reference=${input.reference} LIMIT 1`;
  if (rows.length===0) {
    const exists=await stage`SELECT to_regclass('public.dbk36_wa_payment_orders') IS NOT NULL AS present`;
    if (exists[0]?.present) {
      const permitted=await stage`SELECT
        has_table_privilege(current_user,'public.dbk36_wa_payment_orders','SELECT') AS can_read,
        has_table_privilege(current_user,'public.dbk36_wa_payment_orders','INSERT') AS can_insert,
        has_table_privilege(current_user,'public.dbk36_wa_payment_orders','UPDATE') AS can_update,
        has_table_privilege(current_user,'public.dbk36_wa_payment_orders','DELETE') AS can_delete`;
      if (!permitted[0]?.can_read || permitted[0]?.can_insert || permitted[0]?.can_update || permitted[0]?.can_delete)
        throw new Error('STAGING_ORDER_SOURCE_NOT_READONLY');
      rows=await stage`SELECT reference,wa_id,status,amount_kes,receipt,
        checkout_id,merchant_id,paid_at,cart_json
        FROM public.dbk36_wa_payment_orders WHERE reference=${input.reference} LIMIT 1`;
    }
  }
  if (rows.length!==1) throw new Error('STAGING_PAYMENT_NOT_FOUND');
  const p=rows[0];
  const amount=Number(p.amount_kes);
  if (p.status!=='paid' || p.receipt!==input.receipt || !p.checkout_id ||
      !p.merchant_id || !p.paid_at || amount!==input.confirmedKes ||
      !Array.isArray(p.cart_json) || p.cart_json.length<1 || p.cart_json.length>12)
    throw new Error('PAYMENT_PROOF_MISMATCH');
  const cart: Array<{productId:string;quantity:number;subtotalMinor:number;variantId:string}> = [];
  let subtotal=0;
  for (const raw of p.cart_json) {
    if (!raw || typeof raw!=='object') throw new Error('CART_LINE_INVALID');
    const x=raw as Record<string,unknown>;
    if (typeof x.productId!=='string' || x.productId.length<1 || x.productId.length>180 ||
        !Number.isSafeInteger(x.quantity) || (x.quantity as number)<1 || (x.quantity as number)>20 ||
        typeof x.subtotal!=='number' || x.subtotal<=0) throw new Error('CART_LINE_INVALID');
    const sm=minor(x.subtotal);
    if (sm<=0 || sm%(x.quantity as number)!==0) throw new Error('CART_LINE_INVALID');
    subtotal+=sm;
    cart.push({productId:x.productId,quantity:x.quantity as number,subtotalMinor:sm,
      variantId:typeof x.variantId==='string'?x.variantId:''});
  }
  if (subtotal!==amount*100 || !Number.isSafeInteger(subtotal)) throw new Error('PAID_TOTAL_MISMATCH');
  const payload={reference:input.reference,checkoutId:String(p.checkout_id),receipt:input.receipt,
     merchantId:String(p.merchant_id),waId:String(p.wa_id),amountMinor:subtotal,
     paidAt:new Date(p.paid_at).toISOString(),cart,attestedBy:staff.customerId,
     verificationMode:'staff_till_attested'};
  // One database function; unique reference + receipt + checkout ID; no stock writer invoked.
  const result=await main`SELECT public.dbk36_wa_record_paid_intake(${JSON.stringify(payload)}::jsonb) AS value`;
  const value=result[0]?.value as {reference?:string;status?:string;replayed?:boolean}|undefined;
  if (!value || value.reference!==input.reference || !value.status) throw new Error('PRODUCTION_INTAKE_UNCONFIRMED');
  return {...value,stockDeducted:false,requiresStaffStockReview:true};
}
