/** Cart commands operate only on the editable basket, never on a payment snapshot. */
export type CartIntent={kind:'view'|'clear'|'choose'|'remove'|'keep';target?:string};
const norm=(s:string)=>s.toLowerCase().replace(/[’‘]/g,"'").replace(/[.!?]+$/,'').replace(/\s+/g,' ').trim();
export const CART_CHOICE='Would you like to clear the entire cart or remove a specific item? Reply “clear cart” or “remove item 1”.';
export function cartIntent(text:string,previous=''):CartIntent|null{
  const t=norm(text).replace(/^please /,'').replace(/ please$/,'');
  if(/\b(?:don't|dont|do not|never|if|how (?:can|do|to)|should i|can i)\b/.test(t))return null;
  if(/^(?:cart|basket|my cart|my basket|display (?:my |the )?(?:cart|basket)|(?:show|view|check|list|see) (?:me )?(?:my |the )?(?:cart|basket)|what(?: is|'s) in my cart|what is my total|my total|nionyeshe cart)$/.test(t))return {kind:'view'};
  const keep=/^(?:(?:remove|delete|cancel|clear) (?:all|everything)(?: (?:the |my )?(?:items|products))?(?: (?:from|in) (?:my |the )?(?:cart|basket))? (?:and (?:leave|keep)(?: only)?|except|but (?:leave|keep)(?: only)?)|(?:keep|leave) only) (.+)$/.exec(t);
  if(keep)return {kind:'keep',target:keep[1]};
  if(/^(?:(?:clear|empty) (?:my |the )?(?:cart|basket)|(?:cancel|remove|delete) (?:all|everything)(?: (?:my |the )?(?:items|products)(?: (?:from|in) (?:my |the )?(?:cart|basket))?| (?:from|in) (?:my |the )?(?:cart|basket))|all items cancel them|(?:remove|cancel) everything from my cart)$/.test(t)||previous===CART_CHOICE&&/^(?:all|all items|everything|all of them)$/.test(t))return {kind:'clear'};
  if(/^(?:cancel|remove|delete) (?:my |the )?(?:items|products) (?:in|from) (?:my |the )?(?:cart|basket)$/.test(t))return {kind:'choose'};
  const rm=/^(?:remove|delete) (?:from (?:my |the )?(?:cart|basket) )?(.+?)(?: (?:from|in) (?:my |the )?(?:cart|basket))?$/.exec(t);
  if(rm&&!/\b(?:payment|order|checkout|transaction|account|stock|delivery|completely|quantity)\b/.test(rm[1]))return {kind:'remove',target:rm[1]};
  return null;
}
export function cartTarget(target:string,rows:{label:string;position:number}[]):number|null{
  const number=/^(?:item |number |option )?(\d{1,2})$/.exec(norm(target));
  if(number)return rows.find(r=>r.position===Number(number[1]))?.position??null;
  const words=(s:string)=>s.toLowerCase().replace(/\bgluesticks?\b/g,'glue sticks').replace(/(\d)\s*(mm|cm)\b/g,'$1$2').replace(/[^a-z0-9.]+/g,' ').trim().split(/\s+/).filter(w=>!['the','a','an','my','item','product'].includes(w)).map(w=>w.endsWith('ies')?w.slice(0,-3)+'y':w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w);
  const q=words(target);if(!q.length)return null;
  const matches=rows.filter(r=>{const names=words(r.label);return q.every(w=>names.includes(w));});
  return matches.length===1?matches[0].position:null;
}
export function paymentStatusIntent(text:string){
  const t=norm(text);
  return /^(?:(?:please )?(?:check|refresh|verify|show|display) (?:the |my |our )?(?:payment(?: status)?|transaction status)(?: for me| please| now)?|(?:what is|what's) (?:the )?status of (?:my |the )?payment|(?:what is|what's) my payment status|payment status|(?:i (?:want|need) to )?(?:reset|clear|cancel) (?:my |the |past |previous |pending |old )?payments?(?: status)?|payment in progress|(?:did my payment go through|have i paid|has my payment gone through)|(?:yes )?check the exact status)$/.test(t);
}
export function glueSearchPage(text:string):number|null{
  const t=norm(text).replace(/^(?:search(?: for)?|find|show(?: me)?|do you have|i want|i need|all|list) /,'').replace(/^(?:all |available )+/, '').replace(/\bgluesticks?\b/g,'glue sticks');
  const m=/^glue sticks?(?: (?:available|please))?(?: page ([1-9]\d?))?$/.exec(t);return m?Number(m[1]||1):null;
}
