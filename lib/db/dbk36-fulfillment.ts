import 'server-only';
import {neon} from '@neondatabase/serverless';
import {serverClient} from '@/sanity/lib/serverClient';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {planStockDeduction, validatePaidIntake, type PaidIntake, type ProductSnapshot, type CatalogueProduct} from '@/lib/whatsapp/dbk36-fulfillment-core';

/** This module is intentionally isolated from DBK-51/55/56/62 and never calls M-Pesa.
 * New operational order/fulfillment records live in MAIN Neon; only EXISTING Sanity
 * product + inventory documents are patched, together in one revision-guarded transaction.
 * Cross-store writes are not atomic: a one-time Neon claim prevents unsafe replays.
 */
const HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const STORE='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
const REF=/^DBKWA[A-Z0-9]{7}$/;
function sqlClient(){
  if(process.env.VERCEL_ENV!=='production'||process.env.DBK36_WA_PAID_INTAKE_ENABLED!=='YES'||
    process.env.DBK36_STAGING_WORKER==='YES') throw new Error('PRODUCTION_STAFF_INTAKE_REQUIRED');
  let u:URL;
  try{u=new URL(process.env.DATABASE_URL||'');}catch{throw new Error('MAIN_DATABASE_MISSING');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==HOST||
    u.pathname!=='/neondb'||!u.password||u.searchParams.get('sslmode')!=='require')
    throw new Error('MAIN_DATABASE_PIN_MISMATCH');
  return neon(u.toString());
}
function checkedStockAuthority(){
  if(process.env.DBK_INVENTORY_BACKEND==='neon'||process.env.DBK62_POS_BACKEND==='neon'||
    process.env.DBK62_CUTOVER_APPROVED==='YES'||process.env.DBK36_WA_STORE_LOCATION_ID!==STORE)
    throw new Error('STOCK_AUTHORITY_NOT_PINNED');
  return STORE;
}
function commitEnabled(){
  if(process.env.DBK36_WA_STOCK_COMMIT_ENABLED!=='YES')throw new Error('STOCK_COMMIT_GATE_DISABLED');
}
async function paidRecord(reference:string){
  if(!REF.test(reference))throw new Error('REFERENCE_INVALID');
  const sql=sqlClient();
  const rows=await sql`SELECT reference,provider_receipt,wa_id,checkout_id,amount_minor,
    cart_snapshot,verification_mode,intake_status,attested_by
    FROM public.dbk36_wa_paid_intake WHERE reference=${reference} LIMIT 1`;
  if(!rows.length)throw new Error('TILL_ATTESTED_PAYMENT_NOT_FOUND');
  return rows[0] as unknown as PaidIntake;
}
async function stockSnapshots(ids:string[]){
  return serverClient.fetch<ProductSnapshot[]>(`*[_type == 'product' && _id in $ids]{
    _id,_rev,name,initialStock,available,variants,
    "inventory":*[_type=='inventoryRecord' && product._ref==^._id][0]{
      _id,_rev,locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,
        variants[]{_key,variantId,variantLabel,onHand,incoming}}
    }
  }`,{ids},{cache:'no-store'});
}
async function computePlan(paid:PaidIntake){
  const storeId=checkedStockAuthority();
  const {lines}=validatePaidIntake(paid);
  const [catalogue,stock]=await Promise.all([
    getStoreProducts('pos',storeId),stockSnapshots([...new Set(lines.map(x=>x.productId))]),
  ]);
  return planStockDeduction(paid,catalogue as unknown as CatalogueProduct[],stock,storeId);
}

export async function fulfillmentQueue(){
  const sql=sqlClient();
  const rows=await sql`SELECT p.reference,p.amount_minor,p.intake_status,
    right(p.provider_receipt,4) AS receipt_suffix,
    right(p.wa_id,4) AS customer_suffix,
    f.order_id,f.stock_state,f.fulfillment_state,f.claimed_at,f.stock_committed_at,
    f.last_error_code
    FROM public.dbk36_wa_paid_intake p
    LEFT JOIN public.dbk36_wa_stock_fulfillment f ON f.reference=p.reference
    ORDER BY p.created_at DESC LIMIT 100`;
  return {orders:rows,stockCommitEnabled:process.env.DBK36_WA_STOCK_COMMIT_ENABLED==='YES' ||
      process.env.DBK103_WA_NEON_STOCK_ENABLED==='YES',
    inventoryAuthority:process.env.DBK_INVENTORY_BACKEND==='neon'?'NEON':'SANITY',paymentsInitiated:0};
}
export async function fulfillmentPreview(reference:string){
  const sql=sqlClient();
  const state=await sql`SELECT stock_state,order_id,last_error_code
    FROM public.dbk36_wa_stock_fulfillment WHERE reference=${reference}`;
  if(state.length)return {reference,existing:true,stockState:state[0].stock_state,
    orderId:state[0].order_id,reviewRequired:state[0].stock_state!=='COMMITTED'};
  const paid=await paidRecord(reference);
  const plan=await computePlan(paid);
  return {reference,existing:false,stockState:'READY_FOR_STAFF_APPROVAL',
    amountKes:plan.amountMinor/100,lineCount:plan.lines.length,
    products:plan.products.length,storeId:plan.storeId,stockReserved:false,
    note:'A preview is not a reservation. Product revisions are rechecked during commit.'};
}
async function sanityReceiptAlreadyUsed(receipt:string,reference:string){
  const existing=await serverClient.fetch<Array<{_id:string;paymentReference?:string}>>(
    `*[_type in ['commerceOrder','paymentTransaction'] && providerReceiptNumber==$receipt][0...3]{_id,paymentReference}`,
    {receipt},{cache:'no-store'});
  if(existing.some(x=>x.paymentReference!==reference))throw new Error('PAYMENT_RECEIPT_ALREADY_IN_SALES');
}
export async function commitPaidStock(reference:string,confirmation:string,actor:{customerId:string;customerEmail:string}){
  commitEnabled();
  if(!REF.test(reference)||confirmation!==`COMMIT ${reference}`||!actor.customerId||!actor.customerEmail)
    throw new Error('STAFF_STOCK_APPROVAL_REQUIRED');
  // Staff attestations are not the independently verified Daraja payment proof
  // required by DBK-103. Fail closed rather than update Sanity after cutover.
  if(process.env.DBK_INVENTORY_BACKEND==='neon' || process.env.DBK62_POS_BACKEND==='neon')
    throw new Error('STAFF_ATTESTED_NEON_FULFILLMENT_NOT_APPROVED');
  return postStockOnce(reference,actor,'staff_till_attested');
}
/** Only a Daraja callback independently confirmed by STK Query can reach this path.
 * It must already be inserted in MAIN Neon with the special verification mode.
 * Never process staging rows or mark a payment successful from a bare callback.
 */
export async function commitAutomaticallyVerifiedStock(reference:string){
  if(process.env.DBK36_WA_AUTO_STOCK_ENABLED!=='YES')return {stockState:'AUTO_GATE_OFF',reference};
  const actor={customerId:'DBK36_DARAJA_AUTOMATION',customerEmail:'dbk36-automation@internal.invalid'};
  if(!REF.test(reference))throw new Error('REFERENCE_INVALID');
  const paid=await paidRecord(reference);
  if(paid.verification_mode!=='daraja_api_verified'||paid.attested_by!=='DBK36_DARAJA_QUERY')
    throw new Error('AUTO_PAYMENT_NOT_PROVIDER_VERIFIED');
  const sql=sqlClient();
  const proven=await sql`SELECT 1 AS ok FROM public.dbk36_wa_prod_payment_orders
    WHERE reference=${reference} AND status='paid' AND stock_state IN ('PENDING','REVIEW_REQUIRED','COMMITTED')
      AND receipt IS NOT NULL AND paid_at IS NOT NULL LIMIT 1`;
  if(proven.length!==1)throw new Error('PRODUCTION_PAYMENT_PROOF_NOT_FOUND');
  // DBK-103: once Neon is the stock authority, NEVER update legacy Sanity
  // inventory. One pinned PostgreSQL function claims the provider-verified order,
  // deducts the full basket, and finalizes fulfillment in the SAME transaction.
  if(process.env.DBK_INVENTORY_BACKEND==='neon'){
    if(process.env.DBK103_WA_NEON_STOCK_ENABLED!=='YES' ||
       process.env.DBK62_POS_BACKEND!=='neon')
      throw new Error('DBK103_NEON_FULFILLMENT_NOT_APPROVED');
    // An old Sanity receipt must not be silently converted into a second sale.
    await sanityReceiptAlreadyUsed(paid.provider_receipt,reference);
    const rows=await sql`SELECT public.dbk103_commit_verified_wa_stock(${reference},${STORE}) AS result`;
    const result=rows[0]?.result as {stockState?:string;orderId?:string;replayed?:boolean}|undefined;
    if(result?.stockState!=='COMMITTED')throw new Error('DBK103_NEON_STOCK_RECONCILIATION_REQUIRED');
    return {reference,...result,stockUpdatedIn:'NEON',refundIssued:false};
  }
  // Pre-cutover historical paid-intake stock still follows the guarded legacy path.
  // The explicit stock authority check in postStockOnce() prevents cross-store writes.
  return postStockOnce(reference,actor,'daraja_api_verified');
}
async function postStockOnce(reference:string,actor:{customerId:string;customerEmail:string},
  verificationMode:'staff_till_attested'|'daraja_api_verified'){
  const sql=sqlClient();
  const existing=await sql`SELECT stock_state,order_id FROM public.dbk36_wa_stock_fulfillment WHERE reference=${reference}`;
  if(existing.length)return {reference,orderId:String(existing[0].order_id),
    stockState:String(existing[0].stock_state),replayed:true,
    actionRequired:existing[0].stock_state!=='COMMITTED'};
  // Read-only checks BEFORE irreversible one-time claim.
  const paid=await paidRecord(reference);
  if(paid.verification_mode!==verificationMode)throw new Error('PAYMENT_VERIFICATION_MODE_MISMATCH');
  const plan=await computePlan(paid);
  await sanityReceiptAlreadyUsed(plan.receipt,reference);
  const prior=await sql`SELECT 1 AS yes FROM public.dbk56_pos_payments WHERE provider='daraja'
    AND provider_reference=${plan.receipt} LIMIT 1`;
  if(prior.length)throw new Error('PAYMENT_ALREADY_IN_POS_LEDGER');
  const claim=await sql`SELECT public.dbk36_wa_stock_claim(${reference},${actor.customerId},${plan.storeId}) AS value`;
  const value=claim[0]?.value as {status?:string;claimToken?:string;orderId?:string;replayed?:boolean}|undefined;
  if(!value)throw new Error('NEON_STOCK_CLAIM_FAILED');
  if(value.replayed)return {reference,orderId:value.orderId,stockState:value.status,
    replayed:true,actionRequired:value.status!=='COMMITTED'};
  if(value.status!=='CLAIMED'||!value.claimToken||!/^[-0-9a-f]{36}$/i.test(value.claimToken))
    throw new Error('NEON_CLAIM_RESULT_INVALID');
  const token=value.claimToken;
  const tx=serverClient.transaction();
  for(const p of plan.products){
    tx.patch(p.inventoryId,patch=>patch.ifRevisionId(p.inventoryRev).set({
      location:'Multi-location',locationBalances:p.newLocationBalances,
    }));
    tx.patch(p.productId,patch=>patch.ifRevisionId(p.productRev).set({
      initialStock:p.newInitialStock,available:p.newInitialStock>0,
      ...(p.newVariants?{variants:p.newVariants}:{}),
    }));
  }
  try{
    await tx.commit();
  }catch{
    // The network can fail *after* Sanity committed. Never initiate a retry.
    try{
      await sql`SELECT public.dbk36_wa_stock_finish(${reference},${token}::uuid,
        ${actor.customerId},'REVIEW_REQUIRED','SANITY_OUTCOME_UNCERTAIN') AS value`;
    }catch{/* Keep the claim locked; manual reconciliation remains mandatory. */}
    throw new Error('SANITY_STOCK_OUTCOME_REQUIRES_RECONCILIATION');
  }
  // After confirmed Sanity commit, the Neon finalization may still fail. The claim
  // stays locked; an administrator must reconcile, never repeat the stock mutation.
  let finished:unknown;
  try{
    const rows=await sql`SELECT public.dbk36_wa_stock_finish(${reference},${token}::uuid,
      ${actor.customerId},'COMMITTED','') AS value`;
    finished=rows[0]?.value;
  }catch{throw new Error('STOCK_APPLIED_NEON_FINALIZATION_REVIEW_REQUIRED');}
  if(!finished||(finished as {status?:string}).status!=='COMMITTED')
    throw new Error('STOCK_APPLIED_NEON_FINALIZATION_REVIEW_REQUIRED');
  return {reference,orderId:value.orderId,stockState:'COMMITTED',replayed:false,
    amountKes:plan.amountMinor/100,stockUpdatedIn:'SANITY',orderLedger:'MAIN_NEON_DBK36',
    refundIssued:false};
}
export async function setFulfillment(reference:string,state:string,actor:{customerId:string;customerEmail:string}){
  if(process.env.DBK36_WA_FULFILLMENT_STATE_ENABLED!=='YES')throw new Error('FULFILLMENT_GATE_DISABLED');
  if(!REF.test(reference)||!actor.customerId||!actor.customerEmail||
    !['PREPARING','READY_FOR_PICKUP','HANDED_OVER','REFUND_REVIEW'].includes(state))
    throw new Error('FULFILLMENT_ACTION_INVALID');
  const sql=sqlClient();
  const rows=await sql`SELECT public.dbk36_wa_set_fulfillment_state(${reference},${actor.customerId},${state}) AS value`;
  const result=rows[0]?.value as {reference?:string;status?:string}|undefined;
  if(!result||result.reference!==reference||result.status!==state)throw new Error('FULFILLMENT_UPDATE_UNCONFIRMED');
  return {...result,refundIssued:false,stockReplenished:false};
}
