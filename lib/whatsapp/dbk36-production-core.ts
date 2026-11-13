/** v23 pure checks. Never treat an unsigned Safaricom callback as a settled payment. */
export const PROD_REF=/^DBKWA[A-Z0-9]{7}$/;
export const PROD_PHONE=/^254(?:7|1)\d{8}$/;
/** Default cap stays at KES 500. Raising it to KES 5,000 requires
 * explicit production approval AND a successful real-payment rehearsal.
 * Never use customer/AI-provided values to change this limit. */
export function maxProductionStkKes():number{
  return process.env.DBK100_WA_EXTENDED_STK_APPROVED==='YES'?5000:500;
}
export type CanonicalLine={productId:string;variantId:string;quantity:number;subtotalMinor:number};
export function parseCheckout(input:unknown):{
  reference:string;waId:string;amountKes:number;cart:CanonicalLine[];fulfillment:'pickup'
}|null{
  if(!input||typeof input!=='object'||Array.isArray(input))return null;
  const x=input as Record<string,unknown>;
  if(!PROD_REF.test(String(x.reference||''))||!PROD_PHONE.test(String(x.waId||''))||
    !Number.isSafeInteger(x.amountKes)||(x.amountKes as number)<1||(x.amountKes as number)>maxProductionStkKes()||
    x.fulfillment!=='pickup'||!Array.isArray(x.cart)||!x.cart.length||x.cart.length>12)return null;
  const lines:CanonicalLine[]=[];const unique=new Set<string>();let sum=0;
  for(const item of x.cart){
    if(!item||typeof item!=='object'||Array.isArray(item))return null;
    const r=item as Record<string,unknown>;
    if(typeof r.productId!=='string'||!r.productId.length||r.productId.length>180||
      typeof r.variantId!=='string'||r.variantId.length>180||
      !Number.isSafeInteger(r.quantity)||(r.quantity as number)<1||(r.quantity as number)>20||
      !Number.isSafeInteger(r.subtotalMinor)||(r.subtotalMinor as number)<100||
      (r.subtotalMinor as number)%(r.quantity as number)!==0)return null;
    const key=`${r.productId}|${r.variantId}`;
    if(unique.has(key))return null;
    unique.add(key);sum+=r.subtotalMinor as number;
    lines.push({productId:r.productId,variantId:r.variantId,quantity:r.quantity as number,
      subtotalMinor:r.subtotalMinor as number});
  }
  if(!Number.isSafeInteger(sum)||sum!==(x.amountKes as number)*100)return null;
  return {reference:x.reference as string,waId:x.waId as string,
    amountKes:x.amountKes as number,cart:lines,fulfillment:'pickup'};
}
export function matchedProviderProof(order:{wa_id:string;checkout_id:string|null;
  merchant_id:string|null;amount_kes:number},cb:{checkoutRequestId:string;
  merchantRequestId:string;resultCode:number;phone?:string;amount?:number;
  receiptNumber?:string;transactionDate?:string},query:{CheckoutRequestID?:string;
  MerchantRequestID?:string;ResultCode?:string|number}):boolean{
  return cb.resultCode===0&&Number(query.ResultCode)===0&&
    Boolean(order.checkout_id&&order.merchant_id)&&
    order.checkout_id===cb.checkoutRequestId&&query.CheckoutRequestID===order.checkout_id&&
    order.merchant_id===cb.merchantRequestId&&
    (!query.MerchantRequestID||query.MerchantRequestID===order.merchant_id)&&
    cb.phone===order.wa_id&&cb.amount===Number(order.amount_kes)&&
    typeof cb.receiptNumber==='string'&&/^[A-Za-z0-9]{6,20}$/.test(cb.receiptNumber)&&
    typeof cb.transactionDate==='string'&&/^\d{14}$/.test(cb.transactionDate);
}
export function cleanError(value:unknown){
  const x=value instanceof Error?value.message:'PRODUCTION_AUTOMATION_REVIEW_REQUIRED';
  return /^[A-Z0-9_]{4,70}$/.test(x)?x:'PRODUCTION_AUTOMATION_REVIEW_REQUIRED';
}
