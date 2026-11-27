import {relevantProducts,type SalesProduct} from './dbk155-sales-core';

// Read-only shopping interpretation. Never produces cart or payment commands.
export function wantsHuman(text:string){
  const t=text.toLowerCase().replace(/[’‘]/g,"'");
  if(/\b(?:don't|dont|do not|no need to|not looking to)\b.{0,35}\b(?:talk|speak|chat|human|staff)\b/.test(t))return false;
  return /\b(?:talk|speak|chat|connect|transfer)\b.{0,40}\b(?:human(?: being)?|real person|staff|sales (?:agent|person|team|rep)|customer care|someone|representative)\b/.test(t)||/\b(?:human being|real person|human agent|sales representative)\b.{0,25}\b(?:please|now|tomorrow)\b/.test(t)||/\b(?:nataka|naomba|ningependa|wacha)\b.{0,45}\b(?:mtu|mhudumu|binadamu)\b/.test(t)||/^(?:human being|real person|sales team|customer care|agent)(?: please)?[.!?]*$/.test(t);
}
export const frustratedAutomation=(t:string)=>/\b(?:it seems|looks like|i think|i feel like)\b.{0,35}\b(?:talking|chatting|speaking)\s+(?:to|with)\s+(?:an?\s+)?(?:ai|bot|robot)\b/i.test(t);
export const wholesaleEnquiry=(t:string)=>/\b(?:wholesale|resale|resell|re-sale|bei ya jumla|bei za jumla|kuuza tena)\b/i.test(t)&&!/\b(?:not wholesale|no wholesale|don't want wholesale|dont want wholesale)\b/i.test(t);
export const pointerOnly=(t:string)=>/^(?:this|that|these|those|this one|that one|hii|hizi|hiyo|hizo|nataka (?:hii|hizi|hiyo|hizo)|(?:hii|hizi|hiyo|hizo) ziko)(?: please| pia)?[.!?]*$/i.test(t.trim());
export const NO_MATCH='I couldn’t find a confirmed catalogue match.';
export const previousMiss=(t:string)=>t.startsWith(NO_MATCH)||/^I couldn't find a matching item in our catalogue\./.test(t);
export function cleanProductQuery(query:string){
  return query.toLowerCase().replace(/\b(?:donate|donut|donuts|doughnut|doughnuts)\s+(?:vace|vaces|vase|vases)\b/g,'donut vase')
    .replace(/\bvaces?\b/g,'vase').replace(/\bknotted\b/g,'knot')
    .replace(/\b(?:ni how much|how much(?: is| are)?|bei (?:yake|gani|ngapi)|ni bei gani|price of)\b/g,' ')
    .replace(/^(?:need|nataka|naomba|nionyeshe|mnazo|mna|show me|looking for|i need|i want|i would like)\s+/,'')
    .replace(/[?!.]+$/,'').trim();
}
// Multi-product searches are read-only and bounded, never used to choose a cart item.
export function shoppingGroups(query:string){
  return query.split(/\s+(?:and|na|pamoja na)\s+|\s*,\s*|\s*\n\s*/i).map(cleanProductQuery).filter(Boolean).slice(0,3);
}
export function groupedMatches(query:string,products:SalesProduct[]){
  const groups=shoppingGroups(query);
  if(groups.length>1){
    const full=relevantProducts(cleanProductQuery(query),products,3);
    if(full.length)return {items:full,missing:[],groups:[cleanProductQuery(query)]};
  }
  const results=groups.map(q=>({query:q,matches:relevantProducts(q,products,3)}));
  const items:SalesProduct[]=[];
  // Round-robin so one category cannot hide the other category.
  for(let i=0;i<3;i++)for(const group of results){const p=group.matches[i];if(p&&!items.some(x=>x.id===p.id)&&items.length<3)items.push(p);}
  return {items,missing:results.filter(x=>!x.matches.length).map(x=>x.query),groups};
}

// For visual descriptors only: try an exact query first, then remove common
// colour/material adjectives while preserving the product type and design.
export function visualCatalogueMatches(query:string,products:SalesProduct[],limit=3){
  const cleaned=shoppingGroups(query);
  const items:SalesProduct[]=[];
  for(const group of cleaned){
    const exact=relevantProducts(group,products,limit);
    const simpler=group.replace(/\b(?:white|black|cream|beige|brown|grey|gray|gold|golden|silver|red|pink|green|blue|yellow|purple|orange|ceramic|glass|wooden|metal|plastic|velvet|fabric|cotton|shaped)\b/g,' ').replace(/\s+/g,' ').trim();
    const candidates=exact.length?exact:simpler.split(' ').filter(Boolean).length>=2?relevantProducts(simpler,products,limit):[];
    for(const item of candidates)if(!items.some(x=>x.id===item.id)&&items.length<limit)items.push(item);
  }
  return items;
}
