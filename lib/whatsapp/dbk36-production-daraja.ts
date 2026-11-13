import 'server-only';
/** Production bridge's self-contained Daraja verifier. No staging gateway imports. */
export type DarajaStkCallbackPayload={Body?:{stkCallback?:{
  CheckoutRequestID?:string;MerchantRequestID?:string;ResultCode?:number;ResultDesc?:string;
  CallbackMetadata?:{Item?:Array<{Name?:string;Value?:string|number}>};
}}};
export type DarajaQuery={CheckoutRequestID?:string;MerchantRequestID?:string;ResultCode?:string|number;ResultDesc?:string};
export function callbackMetadata(p:DarajaStkCallbackPayload){
  const v=p?.Body?.stkCallback;const data=new Map((v?.CallbackMetadata?.Item||[]).map(x=>[x.Name||'',x.Value]));
  const amount=Number(data.get('Amount')),phone=String(data.get('PhoneNumber')||'').replace(/\D/g,'');
  const receipt=String(data.get('MpesaReceiptNumber')||'').trim();
  const transactionDate=String(data.get('TransactionDate')||'').replace(/\D/g,'');
  return {checkoutRequestId:String(v?.CheckoutRequestID||'').trim(),merchantRequestId:String(v?.MerchantRequestID||'').trim(),
    resultCode:Number(v?.ResultCode??-1),amount:Number.isFinite(amount)?amount:undefined,
    phone:/^254(?:7|1)\d{8}$/.test(phone)?phone:undefined,
    receiptNumber:receipt||undefined,transactionDate:/^\d{14}$/.test(transactionDate)?transactionDate:undefined};
}
export function darajaTransactionDate(s?:string){
  if(!s||!/^\d{14}$/.test(s))return undefined;
  const n=(a:number,b:number)=>Number(s.slice(a,b));
  const dt=new Date(Date.UTC(n(0,4),n(4,6)-1,n(6,8),n(8,10)-3,n(10,12),n(12,14)));
  // A malformed date cannot be interpreted as an alternative payment timestamp.
  const check=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(dt);
  const part=(k:string)=>check.find(x=>x.type===k)?.value||'';
  return `${part('year')}${part('month')}${part('day')}${part('hour')}${part('minute')}${part('second')}`===s?dt.toISOString():undefined;
}
const stamp=()=>{
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const get=(key:string)=>p.find(x=>x.type===key)?.value||'';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
};
export async function queryDarajaStkStatus(checkoutId:string):Promise<DarajaQuery>{
  if(process.env.MPESA_ENV!=='production'||!/^[-A-Za-z0-9._:]{6,150}$/.test(checkoutId))
    throw new Error('PRODUCTION_DARAJA_QUERY_DISABLED');
  const shortcode=process.env.MPESA_SHORTCODE||'',passkey=process.env.MPESA_PASSKEY||'',
    key=process.env.MPESA_CONSUMER_KEY||'',secret=process.env.MPESA_CONSUMER_SECRET||'';
  if(!/^\d{5,9}$/.test(shortcode)||!passkey||!key||!secret)throw new Error('DARAJA_SECRETS_MISSING');
  const a=await fetch('https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',{
    cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+Buffer.from(`${key}:${secret}`).toString('base64')}});
  if(!a.ok)throw new Error('DARAJA_TOKEN_UNAVAILABLE');
  const tok=(await a.json()) as {access_token?:string};
  if(!tok.access_token)throw new Error('DARAJA_TOKEN_UNAVAILABLE');
  const time=stamp();
  const res=await fetch('https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(18000),
    headers:{Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({BusinessShortCode:shortcode,Password:Buffer.from(shortcode+passkey+time).toString('base64'),
      Timestamp:time,CheckoutRequestID:checkoutId})});
  if(!res.ok)throw new Error('DARAJA_QUERY_NOT_CONFIRMED');
  const out=(await res.json()) as DarajaQuery;
  if(!out||typeof out!=='object')throw new Error('DARAJA_QUERY_INVALID');
  return out;
}
