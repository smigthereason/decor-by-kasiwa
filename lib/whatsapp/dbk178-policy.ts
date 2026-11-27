/** Published business policy is the only source of standard WhatsApp rates. */
import {counties,knownCounty} from './dbk165-checkout-intent';
const countyKey=(s:string)=>s.toLowerCase().replace(/['’]/g,'').replace(/-/g,' ').replace(/\s+/g,' ').trim();
export function countyDeliveryFee(policy:string,county:string):number|null {
  const target=knownCounty(county);
  if(!target||!counties.includes(target))return null;
  const values=new Set<number>();
  for(const row of policy.split(/\r?\n/)){
    const match=/^\s*(?:[-*]\s*)?(?:\d+[.)]\s*)?([\p{L}\s'’\-]+?)\s*(?:=|:|–|—)\s*(?:KES\s*|KSH\s*)?([0-9]+)(?:\s*(?:shillings?|KES|KSH))?\s*(?:\([^\n]*\))?\s*\.?\s*$/iu.exec(row);
    if(!match||!counties.some(c=>countyKey(c)===countyKey(match[1].trim()))||countyKey(match[1].trim())!==countyKey(target))continue;
    const fee=Number(match[2]);
    if(!Number.isSafeInteger(fee)||fee<1||fee>100000)return null;
    values.add(fee);
  }
  return values.size===1?[...values][0]:null;
}
export function payerNumber(text:string):string|null{
  const matches=text.match(/(?<![\d+])(?:\+?254|0)[17](?:[ -]?\d){8}(?![\d-])/g)||[];
  if(matches.length!==1)return null;
  const n=matches[0].replace(/\D/g,'').replace(/^0/,'254');
  return /^254[17]\d{8}$/.test(n)?n:null;
}
export function alternatePayerRequest(text:string):boolean{
  return !/\b(?:don't|dont|not|never|cancel)\b/i.test(text)&&/^(?:(?:i (?:want|would like|need) to |please )?(?:use|pay (?:with|using)|change to) )?(?:a |an )?(?:different|another|other|alternative)(?:\s+(?:m[ -]?pesa|payment|phone|mobile|whatsapp))*\s+number[.!?]?$/i.test(text.trim());
}
export const PAYER_INPUT='Sure! Enter the M-PESA number you want to use, e.g. 0712345678 or 0112345678. Make sure the phone owner is expecting the prompt.';
// Exact digits are shown only to the originating private chat, not diagnostic logs.
export const displayPayer=(n:string)=>'0'+n.slice(3);

/** Match explicitly published timing statements; never promise an unlisted SLA. */
export function deliveryTiming(policy:string):string|null {
  const lines=policy.split(/\r?\n/).map(s=>s.trim());
  const production=lines.find(s=>/^delivery takes \d{1,2}\s*(?:hrs?|hours?|days?) for all production items\s+after payment is confirmed[.!]?$/i.test(s));
  const flowers=lines.find(s=>/^for all flowers delivery takes place within the same day[.!]?$/i.test(s));
  return [production,flowers].filter(Boolean).join('\n')||null;
}
