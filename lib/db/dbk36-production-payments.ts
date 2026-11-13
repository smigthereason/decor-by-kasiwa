import 'server-only';
import {neon} from '@neondatabase/serverless';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {compareAuthoritativeQuote} from '@/lib/whatsapp/dbk36-stock-check-core';
import {callbackMetadata,darajaTransactionDate,queryDarajaStkStatus,
  type DarajaStkCallbackPayload} from '@/lib/whatsapp/dbk36-production-daraja';
import {commitAutomaticallyVerifiedStock} from '@/lib/db/dbk36-fulfillment';
import {parseCheckout,matchedProviderProof,PROD_REF,cleanError} from '@/lib/whatsapp/dbk36-production-core';
import {productionBridgeEnabled} from '@/lib/whatsapp/dbk36-production-auth';

const PINNED_STORE='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
const CALLBACK='https://dbk36-whatsapp-production.victor-dmaina.workers.dev/api/whatsapp/stk/callback';
const CALLBACK_ID=/^[A-Za-z0-9._:-]{6,150}$/;
function db(){
  if(!productionBridgeEnabled())throw new Error('PRODUCTION_BRIDGE_DISABLED');
  return neon(process.env.DATABASE_URL!);
}
function paymentConfig(){
  const e=process.env;
  if(e.DBK36_WA_PRODUCTION_CHECKOUT_ENABLED!=='YES'||e.DBK36_WA_STORE_LOCATION_ID!==PINNED_STORE||
    e.MPESA_ENV!=='production'||e.DBK36_WA_PRODUCTION_MPESA_CALLBACK_URL!==CALLBACK)
    throw new Error('PRODUCTION_CHECKOUT_DISABLED');
  const shortcode=e.MPESA_SHORTCODE||'',passkey=e.MPESA_PASSKEY||'';
  const consumer=e.MPESA_CONSUMER_KEY||'',secret=e.MPESA_CONSUMER_SECRET||'';
  if(!/^\d{5,9}$/.test(shortcode)||!passkey||!consumer||!secret)
    throw new Error('PRODUCTION_DARAJA_CONFIGURATION_MISSING');
  return {shortcode,passkey,consumer,secret,partyB:e.MPESA_PARTY_B||shortcode,
    type:e.MPESA_TRANSACTION_TYPE==='CustomerPayBillOnline'?'CustomerPayBillOnline':'CustomerBuyGoodsOnline'};
}
function kenyaStamp(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const get=(name:string)=>parts.find(x=>x.type===name)?.value||'';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}
async function initiateProdStk(phone:string,amount:number,reference:string){
  const cfg=paymentConfig();
  const auth=await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',{
    headers:{Authorization:'Basic '+Buffer.from(cfg.consumer+':'+cfg.secret).toString('base64')},cache:'no-store'});
  if(!auth.ok)throw new Error('DARAJA_AUTHENTICATION_FAILED');
  const token=(await auth.json()) as {access_token?:string};
  if(!token.access_token)throw new Error('DARAJA_TOKEN_MISSING');
  const stamp=kenyaStamp();
  const response=await fetch('https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',{
    method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({BusinessShortCode:cfg.shortcode,
      Password:Buffer.from(cfg.shortcode+cfg.passkey+stamp).toString('base64'),Timestamp:stamp,
      TransactionType:cfg.type,Amount:amount,PartyA:phone,PartyB:cfg.partyB,PhoneNumber:phone,
      CallBackURL:CALLBACK,AccountReference:reference.slice(0,12),TransactionDesc:'Decor By Kasiwa WhatsApp'}),
  });
  const output=(await response.json()) as {ResponseCode?:string;CheckoutRequestID?:string;MerchantRequestID?:string};
  if(!response.ok||output.ResponseCode!=='0'||!output.CheckoutRequestID||!output.MerchantRequestID)
    throw new Error('DARAJA_STK_REQUEST_NOT_CONFIRMED');
  if(!CALLBACK_ID.test(output.CheckoutRequestID)||!CALLBACK_ID.test(output.MerchantRequestID))
    throw new Error('DARAJA_STK_RESPONSE_INVALID');
  return {checkoutId:output.CheckoutRequestID,merchantId:output.MerchantRequestID};
}
/** CHECKOUT creates a quote only. It never charges the customer. */
export async function createProductionCheckout(raw:unknown){
  const input=parseCheckout(raw);
  if(!input)throw new Error('CHECKOUT_REQUEST_INVALID');
  if(process.env.DBK36_WA_STORE_LOCATION_ID!==PINNED_STORE)
    throw new Error('PRODUCTION_STORE_PIN_INVALID');
  // Never use an unchecked cart price to open a payment quote.
  const catalogue=await getStoreProducts('pos',PINNED_STORE);
  const lines=input.cart.map(x=>({productId:x.productId,variantId:x.variantId,
    quantity:x.quantity,subtotal:x.subtotalMinor/100}));
  if(lines.some(x=>!Number.isSafeInteger(x.subtotal))||!compareAuthoritativeQuote(
    {reference:input.reference,amountKes:input.amountKes,lines},catalogue,catalogue))
    throw new Error('LIVE_STORE_PRICE_OR_STOCK_NOT_VERIFIED');
  const sql=db();
  await sql`UPDATE public.dbk36_wa_prod_payment_orders
    SET status='cancelled',last_error_code='QUOTE_EXPIRED',updated_at=now()
    WHERE wa_id=${input.waId} AND status='quoted' AND expires_at<=now()`;
  const existing=await sql`SELECT reference,status,amount_kes FROM public.dbk36_wa_prod_payment_orders
    WHERE wa_id=${input.waId} AND status IN ('quoted','starting','prompt_sent','review_required')
    ORDER BY created_at DESC LIMIT 1`;
  if(existing.length)return {reference:existing[0].reference,status:existing[0].status,
    amountKes:existing[0].amount_kes,existing:true};
  const rows=await sql`INSERT INTO public.dbk36_wa_prod_payment_orders
    (reference,wa_id,amount_kes,cart_snapshot,status)
    VALUES(${input.reference},${input.waId},${input.amountKes},${JSON.stringify(input.cart)}::jsonb,'quoted')
    ON CONFLICT(reference) DO NOTHING RETURNING reference`;
  if(rows.length!==1)throw new Error('QUOTE_CONFLICT_NO_PAYMENT_SENT');
  return {reference:input.reference,status:'quoted',amountKes:input.amountKes,existing:false};
}
export async function productionCustomerOrder(waId:string){
  if(!/^254(?:7|1)\d{8}$/.test(waId))throw new Error('PHONE_INVALID');
  const sql=db();
  const rows=await sql`SELECT reference,status,amount_kes,expires_at,pickup_confirmed_at,
    receipt,stock_state,cart_snapshot FROM public.dbk36_wa_prod_payment_orders
    WHERE wa_id=${waId} ORDER BY created_at DESC LIMIT 1`;
  return rows[0]||null;
}
export async function confirmProductionPickup(waId:string){
  const sql=db();
  const updated=await sql`UPDATE public.dbk36_wa_prod_payment_orders
    SET pickup_confirmed_at=now(),updated_at=now() WHERE wa_id=${waId}
    AND status='quoted' AND expires_at>now() RETURNING reference,amount_kes`;
  return updated[0]||null;
}
export async function cancelProductionQuote(waId:string){
  const sql=db();
  const updated=await sql`UPDATE public.dbk36_wa_prod_payment_orders
    SET status='cancelled',updated_at=now() WHERE wa_id=${waId} AND status='quoted'
    RETURNING reference`;
  return updated.length>0;
}
/** PAY requires independently confirmed pickup and a fresh stock/price check.
 * The DB transition to starting occurs before calling Daraja; any uncertainty
 * locks the attempt for staff reconciliation and MUST NOT initiate a second STK.
 */
export async function payProductionCheckout(waId:string){
  paymentConfig();
  const order=await productionCustomerOrder(waId);
  if(!order||order.status!=='quoted')throw new Error('NO_UNPAID_QUOTE');
  const reference=String(order.reference),amount=Number(order.amount_kes);
  if(!order.pickup_confirmed_at)throw new Error('PICKUP_CONFIRMATION_REQUIRED');
  if(new Date(String(order.expires_at)).getTime()<=Date.now())throw new Error('QUOTE_EXPIRED');
  const cart=order.cart_snapshot as Array<{productId:string;variantId:string;quantity:number;subtotalMinor:number}>;
  const parsed=parseCheckout({reference,waId,amountKes:amount,cart,fulfillment:'pickup'});
  if(!parsed)throw new Error('CHECKOUT_SNAPSHOT_INVALID');
  const catalogue=await getStoreProducts('pos',PINNED_STORE);
  const lines=parsed.cart.map(x=>({productId:x.productId,variantId:x.variantId,
    quantity:x.quantity,subtotal:x.subtotalMinor/100}));
  if(lines.some(x=>!Number.isSafeInteger(x.subtotal))||!compareAuthoritativeQuote(
    {reference,amountKes:amount,lines},catalogue,catalogue))
    throw new Error('LIVE_STOCK_CHANGED_NO_CHARGE');
  const sql=db();
  const claims=await sql`UPDATE public.dbk36_wa_prod_payment_orders
    SET status='starting',updated_at=now() WHERE reference=${reference} AND wa_id=${waId}
    AND status='quoted' AND pickup_confirmed_at IS NOT NULL AND expires_at>now()
    RETURNING reference`;
  if(claims.length!==1)throw new Error('PAYMENT_ALREADY_IN_PROGRESS_NO_RETRY');
  try{
    const result=await initiateProdStk(waId,amount,reference);
    const saved=await sql`UPDATE public.dbk36_wa_prod_payment_orders
      SET checkout_id=${result.checkoutId},merchant_id=${result.merchantId},status='prompt_sent',updated_at=now()
      WHERE reference=${reference} AND status='starting' RETURNING reference`;
    if(saved.length!==1)throw new Error('STK_ACCEPTED_STORAGE_REVIEW_REQUIRED');
    return {reference,status:'STK_PROMPT_SENT',amountKes:amount};
  }catch{
    try{await sql`UPDATE public.dbk36_wa_prod_payment_orders
      SET status='review_required',last_error_code='STK_INITIATION_OUTCOME_UNCERTAIN',updated_at=now()
      WHERE reference=${reference} AND status='starting'`;}catch{/* preserved as starting; no replay */}
    throw new Error('STK_OUTCOME_UNCERTAIN_NO_RETRY');
  }
}

/** Persist raw callback before acknowledging Safaricom; never trust its contents alone. */
export async function acceptProductionStkCallback(payload:DarajaStkCallbackPayload){
  if(!productionBridgeEnabled())throw new Error('PRODUCTION_BRIDGE_DISABLED');
  const callback=callbackMetadata(payload);
  if(!CALLBACK_ID.test(callback.checkoutRequestId)||!CALLBACK_ID.test(callback.merchantRequestId))
    throw new Error('CALLBACK_ID_INVALID');
  const sql=db();
  await sql`INSERT INTO public.dbk36_wa_prod_callback_inbox(checkout_id,merchant_id,payload)
    VALUES(${callback.checkoutRequestId},${callback.merchantRequestId},${JSON.stringify(payload)}::jsonb)
    ON CONFLICT(checkout_id) DO UPDATE SET payload=EXCLUDED.payload,merchant_id=EXCLUDED.merchant_id
      WHERE public.dbk36_wa_prod_callback_inbox.query_confirmed_at IS NULL`;
  // Response can be acknowledged now that evidence is durable; provider query may lag.
  try{await reconcileProductionCheckout(callback.checkoutRequestId);}
  catch{console.error('[DBK36 PROD] Settlement awaiting independent provider query');}
  return {accepted:true};
}
export async function reconcileProductionCheckout(checkoutId:string){
  if(!CALLBACK_ID.test(checkoutId))throw new Error('CHECKOUT_ID_INVALID');
  const sql=db();
  const row=await sql`SELECT * FROM public.dbk36_wa_prod_payment_orders WHERE checkout_id=${checkoutId} LIMIT 1`;
  if(row.length!==1)return {state:'ORDER_NOT_YET_LINKED'};
  const order=row[0] as unknown as {reference:string;wa_id:string;amount_kes:number;
    checkout_id:string;merchant_id:string;status:string;stock_state:string};
  if(order.status==='paid'){
    await safeAutoStock(order.reference,sql);
    return {state:'ALREADY_PAID'};
  }
  if(order.status!=='prompt_sent'&&order.status!=='review_required')return {state:'UNSETTLEABLE'};
  const seen=await sql`SELECT merchant_id,payload FROM public.dbk36_wa_prod_callback_inbox WHERE checkout_id=${checkoutId}`;
  if(seen.length!==1)return {state:'CALLBACK_PENDING'};
  const cb=callbackMetadata(seen[0].payload as DarajaStkCallbackPayload);
  if(cb.checkoutRequestId!==checkoutId||cb.merchantRequestId!==order.merchant_id||
    seen[0].merchant_id!==order.merchant_id)return {state:'CALLBACK_MISMATCH'};
  if(process.env.MPESA_ENV!=='production')throw new Error('PRODUCTION_DARAJA_REQUIRED');
  const provider=await queryDarajaStkStatus(checkoutId);
  if(!matchedProviderProof(order,cb,provider)){
    if(cb.resultCode!==0&&Number(provider.ResultCode)===cb.resultCode&&
       provider.CheckoutRequestID===checkoutId){
      await sql`UPDATE public.dbk36_wa_prod_payment_orders
        SET status='failed',last_error_code='DARAJA_DECLINED',updated_at=now()
        WHERE reference=${order.reference} AND status='prompt_sent'`;
      return {state:'PROVIDER_DECLINED'};
    }
    return {state:'PROVIDER_CONFIRMATION_PENDING'};
  }
  const providerTime=darajaTransactionDate(cb.transactionDate);
  if(!providerTime)throw new Error('DARAJA_TRANSACTION_DATE_INVALID');
  // Provider query MUST succeed before recording a receipt, creating an intake,
  // or invoking one-time stock mutation. SQL finalization is atomic.
  await sql`UPDATE public.dbk36_wa_prod_callback_inbox SET query_confirmed_at=now()
    WHERE checkout_id=${checkoutId} AND merchant_id=${order.merchant_id}`;
  const settled=await sql`SELECT public.dbk36_wa_prod_finalize_paid(${order.reference},${checkoutId},
    ${order.merchant_id},${cb.receiptNumber!},${order.wa_id},${order.amount_kes},
    ${providerTime}::timestamptz) AS value`;
  const result=settled[0]?.value as {state?:string}|undefined;
  if(result?.state!=='paid')throw new Error('NEON_PRODUCTION_SETTLEMENT_UNCONFIRMED');
  await safeAutoStock(order.reference,sql);
  return {state:'PAID',reference:order.reference};
}
async function safeAutoStock(reference:string,sql:ReturnType<typeof db>){
  if(process.env.DBK36_WA_AUTO_STOCK_ENABLED!=='YES')return;
  try{
    const result=await commitAutomaticallyVerifiedStock(reference) as {stockState?:string};
    if(result.stockState==='COMMITTED'){
      await sql`UPDATE public.dbk36_wa_prod_payment_orders SET stock_state='COMMITTED',
        updated_at=now() WHERE reference=${reference} AND stock_state<>'COMMITTED'`;
    } else if(result.stockState!=='AUTO_GATE_OFF'){
      await sql`UPDATE public.dbk36_wa_prod_payment_orders
        SET stock_state='REVIEW_REQUIRED',last_error_code='STOCK_CLAIM_NOT_COMMITTED',updated_at=now()
        WHERE reference=${reference} AND stock_state='PENDING'`;
    }
  }catch(error){
    const code=cleanError(error);
    console.error('[DBK36 PROD] Stock requires review:',code);
    await sql`UPDATE public.dbk36_wa_prod_payment_orders
      SET stock_state='REVIEW_REQUIRED',last_error_code=${code},updated_at=now()
      WHERE reference=${reference} AND stock_state='PENDING'`;
  }
}
export async function recoverProductionPayments(){
  const sql=db();
  const rows=await sql`SELECT checkout_id FROM public.dbk36_wa_prod_payment_orders
    WHERE checkout_id IS NOT NULL AND (status IN ('prompt_sent','review_required') OR
      (status='paid' AND stock_state='PENDING')) ORDER BY updated_at ASC LIMIT 8`;
  const outcomes=[];
  for(const x of rows){
    try{outcomes.push(await reconcileProductionCheckout(String(x.checkout_id)));}
    catch{outcomes.push({state:'REVIEW_RETRY_LATER'});}
  }
  return {checked:rows.length,outcomes};
}
