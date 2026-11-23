import 'server-only';
import { dbk62GetProductionSql } from '@/lib/db/dbk62-pos-cutover';
import { dbk134AuthorizeOrder,dbk134Enabled } from '@/lib/db/dbk134-online-operations';
import type { ApiStaffRole } from '@/lib/auth/api-authorization';

function db() {
  if(!dbk134Enabled()||process.env.DBK134_PAYSTACK_REFUNDS!=='YES') throw Error('Paystack online refunds are disabled');
  return dbk62GetProductionSql();
}
const api='https://api.paystack.co';
function key() {
  const value=process.env.PAYSTACK_SECRET_KEY?.trim();
  if(!value?.startsWith('sk_')) throw Error('Paystack secret key is not configured');
  return value;
}
function uuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function amountMinor(value:unknown) {
  const amount=typeof value==='number'?value:NaN;
  const cents=Math.round(amount*100);
  if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(cents)||Math.abs(cents/100-amount)>0.000001) throw Error('Refund amount must be a positive KES value');
  return cents;
}
async function paystack(path:string,options:RequestInit={}) {
  const response=await fetch(`${api}${path}`,{...options,cache:'no-store',headers:{
    Authorization:`Bearer ${key()}`,'Content-Type':'application/json',...(options.headers||{})}});
  const json=await response.json().catch(()=>({})) as {status?:boolean;message?:string;data?:Record<string,unknown>};
  if(!response.ok||json.status!==true) throw Error(`Paystack returned ${response.status}: ${String(json.message||'Provider request rejected').slice(0,200)}`);
  return json.data||{};
}
type StartInput={orderId:string;requestId:string;amount?:number;reason:string;actorId:string;actorName:string;
 role:ApiStaffRole;storeId?:string};
export async function dbk134StartRefund(input:StartInput) {
  if(!uuid(input.requestId)) throw Error('A unique refund request ID is required');
  const minor=amountMinor(input.amount);
  if(input.reason.trim().length<8||input.reason.length>500) throw Error('A refund reason of 8–500 characters is required');
  const order=await dbk134AuthorizeOrder({id:input.orderId,role:input.role,storeLocationId:input.storeId});
  if(order.paymentStatus!=='paid') throw Error('Only paid orders qualify for provider refunds');
  const sql=db();
  const snapshot=await sql`SELECT provider_transaction_id,amount_minor,reference FROM public.dbk64_online_orders
    WHERE order_id=${input.orderId} AND payment_status='PAID' AND stock_status='COMMITTED'`;
  if(!snapshot.length||!snapshot[0].provider_transaction_id) throw Error('Refund requires a settled Paystack payment');
  // Verify the original provider transaction before reserving or refunding.
  const original=await paystack(`/transaction/verify/${encodeURIComponent(String(snapshot[0].reference))}`);
  if(original.status!=='success'||String(original.currency)!=='KES'||
     String(original.reference)!==String(snapshot[0].reference)||
     String(original.id)!==String(snapshot[0].provider_transaction_id)||
     Number(original.amount)!==Number(snapshot[0].amount_minor)) throw Error('Provider payment does not match Neon; refund blocked');
  const reserve=await sql`SELECT public.dbk134_reserve_online_refund(
    ${input.requestId}::uuid,${input.orderId},${minor},${input.reason.trim()},${input.actorId},${input.actorName}) AS result`;
  const state=reserve[0]?.result as {status?:string;reference?:string;replayed?:boolean}|undefined;
  if(!state?.reference) throw Error('Refund reservation was not confirmed');
  if(state.status!=='reserved'||state.replayed) {
    return {requestId:input.requestId,providerReference:state.reference,status:state.status,
      message:'This refund request already exists. Review its status before retrying; no second provider call was made.'};
  }
  // Once claimed, NEVER automatically retry after a network or provider uncertainty.
  const claim=await sql`SELECT public.dbk134_claim_online_refund(${input.requestId}::uuid) AS claimed`;
  if(claim[0]?.claimed!==true) throw Error('Refund request was already claimed; no provider call sent');
  try {
    const payload=await paystack('/refund',{method:'POST',body:JSON.stringify({
      transaction:String(snapshot[0].provider_transaction_id),amount:minor,currency:'KES',
      reference:state.reference,customer_note:input.reason.trim(),
      merchant_note:`${order.orderNumber} — ${input.actorName}`.slice(0,180),
    })});
    const providerId=payload.id==null?null:String(payload.id);
    const returnedRef=String(payload.reference||state.reference);
    if(returnedRef!==state.reference) throw Error('Provider refund reference mismatch; manual reconciliation required');
    const status=['pending','processing','processed'].includes(String(payload.status))?String(payload.status):'review_required';
    await sql`SELECT public.dbk134_update_online_refund(${state.reference},${status},${providerId},
      ${String(payload.status||'Provider response')},'api')`;
    return {requestId:input.requestId,providerReference:state.reference,status,
      message:status==='processed'?'Refund confirmed by Paystack.':'Refund submitted to Paystack. Await provider processing; do not submit again.'};
  } catch(error) {
    // A timeout may mean the refund was accepted. Preserve reservation and block automatic retries.
    await sql`SELECT public.dbk134_update_online_refund(${state.reference},'review_required',${null},
      ${error instanceof Error?error.message:'Provider response uncertain'},'api')`;
    return {requestId:input.requestId,providerReference:state.reference,status:'review_required',
      message:'Refund outcome requires provider reconciliation; do not submit another refund.'};
  }
}
export async function dbk134ApplyRefundWebhook(event:string,data:Record<string,unknown>) {
  if(!dbk134Enabled() || process.env.DBK134_PAYSTACK_REFUNDS!=='YES') return;
  if(!['refund.pending','refund.processing','refund.processed','refund.failed','refund.needs-attention'].includes(event)) return;
  const sql=db();
  const paymentReference=String(data.transaction_reference||(data.transaction as {reference?:string}|undefined)?.reference||'');
  let reference=String(data.refund_reference||data.reference||'');
  // The Paystack webhook schema may supply refund_reference:null. Never infer a refund
  // from amount + transaction alone: delayed events could belong to an earlier refund.
  // The Admin can reconcile via Paystack GET /refund using the unique reference.
  if(!/^DBK134-[0-9a-f]{32}$/i.test(reference)) return;
  const rows=await sql`SELECT r.amount_minor,r.payment_reference,r.provider_refund_id
    FROM public.dbk134_online_refunds r WHERE r.provider_reference=${reference} LIMIT 1`;
  if(!rows.length) throw Error('Unknown DBK134 provider refund reference');
  if(paymentReference && paymentReference!==rows[0].payment_reference) throw Error('Refund webhook payment-reference mismatch');
  if(data.amount!==undefined && Number(data.amount)!==Number(rows[0].amount_minor)) throw Error('Refund webhook amount mismatch');
  const status=event==='refund.needs-attention'?'review_required':event.slice('refund.'.length);
  const id=data.id==null?null:String(data.id);
  await sql`SELECT public.dbk134_update_online_refund(${reference},${status},${id},
    ${String(data.status||event)},'webhook')`;
}

/** Read-only provider lookup followed by an audited local status update. Never creates a second refund. */
export async function dbk134ReconcileRefund(input:{orderId:string;requestId:string}) {
 if(!uuid(input.requestId))throw Error('Invalid refund request ID');
 const sql=db();
 const rows=await sql`SELECT provider_reference,provider_refund_id,amount_minor,payment_reference,status
   FROM public.dbk134_online_refunds WHERE order_id=${input.orderId} AND request_id=${input.requestId}::uuid LIMIT 1`;
 if(!rows.length)throw Error('Refund request not found');
 const row=rows[0];
 const reference=String(row.provider_reference);
 if(row.status==='processed'||row.status==='failed')return {status:row.status,providerReference:reference};
 const response=await fetch(`${api}/refund?reference=${encodeURIComponent(reference)}`,{
   cache:'no-store',headers:{Authorization:`Bearer ${key()}`}});
 const body=await response.json() as {status?:boolean;data?:Array<Record<string,unknown>>};
 if(!response.ok||body.status!==true)throw Error('Paystack refund lookup unavailable');
 const records=Array.isArray(body.data)?body.data:[];
 const matching=records.filter(v=>v && typeof v==='object' && String((v as Record<string,unknown>).reference)===reference) as Array<Record<string,unknown>>;
 if(matching.length!==1) return {status:'review_required',providerReference:reference,message:'No unambiguous provider refund found. Check Paystack Dashboard; do not submit again.'};
 const refund=matching[0];
 if(Number(refund.amount)!==Number(row.amount_minor)||String(refund.currency)!=='KES'||
   (row.provider_refund_id&&String(refund.id)!==String(row.provider_refund_id))) {
     throw Error('Provider refund does not match the local reservation');
   }
 const status=['pending','processing','processed','failed'].includes(String(refund.status))?String(refund.status):'review_required';
 await sql`SELECT public.dbk134_update_online_refund(${reference},${status},
   ${refund.id==null?null:String(refund.id)},${String(refund.status||'Provider readback')},'reconciliation')`;
 return {status,providerReference:reference};
}
