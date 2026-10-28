/** Pure DBK-63 input validation. Never accepts JavaScript-rounded monetary amounts. */
import { createHash } from 'node:crypto';

export const realOrderId = (s:unknown):s is string => typeof s==='string' && /^dbk62\.order\.[0-9a-f]{24}$/.test(s);
export const externalReference = (s:unknown):s is string => typeof s==='string' &&
  /^[A-Za-z0-9._-]{5,100}$/.test(s) && !/(?:TEST|SYNTHETIC)/i.test(s);
export function moneyMinor(input:unknown, allowZero=false):number {
  if (typeof input!=='number' || !Number.isFinite(input) || input < 0 || input>10_000_000_000) {
    throw new Error('Amount must be a finite, nonnegative KES number');
  }
  const minor = Math.round(input*100);
  if (!Number.isSafeInteger(minor) || minor>1_000_000_000_000 ||
      Math.abs(input*100-minor)>0.000001 || (!allowZero && minor===0)) {
    throw new Error('Amount must use no more than two decimal places and be greater than zero');
  }
  return minor;
}
export function stableKey(label:'payment'|'refund', orderId:string, key:string):string {
  return `dbk63-${label}-`+createHash('sha256').update(`${label}\0${orderId}\0${key}`).digest('hex').slice(0,32);
}
export type RefundLine={productId:string;variantId?:string;quantity:number};
export function normalizeRefundLines(input:unknown, restock:boolean):Array<{productId:string;variantId:string;quantity:number}> {
  if (!Array.isArray(input) || input.length>100 || (!restock && input.length>0) || (restock && input.length===0)) {
    throw new Error('Return lines must match restock selection');
  }
  const seen=new Set<string>();
  return input.map((item:RefundLine)=>{
    const productId=typeof item?.productId==='string'?item.productId.trim():'';
    const variantId=typeof item?.variantId==='string'?item.variantId.trim():'';
    const quantity=item?.quantity;
    if (!/^[\w.-]{1,180}$/.test(productId) || (variantId && !/^[\w.-]{1,180}$/.test(variantId)) ||
        !Number.isSafeInteger(quantity) || quantity<1 || quantity>1_000_000) throw new Error('Invalid returned product or quantity');
    const key=`${productId}\0${variantId}`;
    if (seen.has(key)) throw new Error('Duplicate product/variant return line');
    seen.add(key);
    return {productId,variantId,quantity};
  });
}
