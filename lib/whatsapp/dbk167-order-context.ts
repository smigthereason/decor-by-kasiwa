import { relevantProducts, purchaseFollowup, type SalesProduct } from './dbk155-sales-core';
import { cleanProductQuery } from './dbk166-sales-recovery';
import type { DeliveryZone } from '../shipping';

// Explicit requests only: never interpret a question, image caption or negative
// statement as an instruction to modify a cart.
export function namedOrderRequest(text: string): {query: string; quantity?: number} | null {
  const t = text.trim().replace(/[’‘]/g, "'");
  if (t.includes('?') || /\b(?:don't|dont|do not|not|cancel|remove|instead|if|how|can you|could you)\b/i.test(t)) return null;
  const m = /^(?:please\s+)?(?:(?:i (?:want|would like|need) to |i'd like to )?(?:place|make) (?:an? |my |the )?order for|i (?:want|would like|need) to (?:buy|order|purchase)|i'd like to (?:buy|order|purchase)|nataka kuagiza)\s+([\s\S]+)$/i.exec(t);
  if (!m) return null;
  const raw = m[1].trim();
  // Deliberately require an explicit quantity phrase or separate quantity line;
  // decimal dimensions such as 3.5 Cm are product attributes, not quantities.
  const suffix = /(?:[\n,;]+\s*|\s+(?=just\b|only\b|quantity\b|qty\b))((?:(?:just|only|quantity\s*[:=]?|qty\s*[:=]?)\s*)?(?:\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|moja|mbili|tatu)(?:\s+(?:pieces?|units?|items?|packs?))?(?:\s+please)?)[.!]?$/i.exec(raw);
  let query = suffix ? raw.slice(0, suffix.index) : raw;
  let quantity: number | undefined;
  if (suffix) {
    const qty = suffix[1].replace(/^(?:quantity|qty)\s*[:=]?\s*/i, '').replace(/\b(?:packs?)\b/i, 'pieces');
    quantity = purchaseFollowup(qty)?.quantity;
  } else {
    const prefix = /^(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|moja|mbili|tatu)\s+(?:(?:pieces?|units?|items?|packs?)\s+of\s+)(.+)$/i.exec(query);
    if (prefix) { quantity = purchaseFollowup(prefix[1])?.quantity; query = prefix[2]; }
  }
  query = cleanProductQuery(query.replace(/^(?:the |a |an )/i, '').trim());
  if (!query || /^(?:it|one|this|that|these|those|this one|that one|these items|those items|them|my order|the order)$/i.test(query) || /\b(?:and|na|or)\b/i.test(query) || query.includes('\n')) return null;
  return {query, quantity};
}
export function namedOrderCandidates(query: string, products: SalesProduct[]): SalesProduct[] {
  const dimensions: string[] = query.match(/\d+(?:\.\d+)?/g) || [];
  // Preserve decimal size; the generic text search strips short numeric tokens.
  const scoped = dimensions.length ? products.filter(p => {
    const nums: string[] = p.name.match(/\d+(?:\.\d+)?/g) || [];
    return dimensions.every(n => nums.includes(n));
  }) : products;
  return relevantProducts(query, scoped, scoped.length);
}
export type DeliveryContext = {location: string; county: string; method?: string};
export function parseDeliveryContext(value: unknown): DeliveryContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.location !== 'string' || !v.location || v.location.length > 70 || typeof v.county !== 'string' || v.county.length > 40) return null;
  return {location:v.location, county:v.county, ...(typeof v.method === 'string' && v.method.length <= 60 ? {method:v.method} : {})};
}
const key = (s: string) => s.toLowerCase().replace(/[-’']/g,' ').replace(/\s+/g,' ').trim();
export function deliveryChoices(county:string, zones:DeliveryZone[], countyApproved:boolean):DeliveryZone[] {
  const target=key(county);
  return zones.filter(z=>{
    if (!z.active || z.id==='shop-pickup' || /\bpickup\b|\bcollection\b/i.test(z.label) || !Number.isFinite(z.fee) || z.fee<0) return false;
    const label=key(z.label), id=key(z.id);
    if(target==='nairobi') return /\bnairobi\b|\bcbd\b/.test(label+' '+id);
    return label===target || id===target || label===target+' county' || (countyApproved && id==='long distance matatu');
  }).slice(0,5);
}
export function deliveryMethod(text:string):string|null {
  const t=text.toLowerCase().replace(/[’‘]/g,"'").replace(/[.!]+$/,'').replace(/\s+/g,' ').trim();
  if(text.includes('?')||/\b(?:not|don't|dont|no|how|what|if|price|cost)\b/.test(t))return null;
  const m=/^(?:(?:i (?:want|prefer|choose|will use|would like)|i'll use|use|send via|via|nataka|please use|please arrange) )?(rider(?: delivery| quote)?|matatu(?: delivery)?|within cbd|outside cbd(?: via matatu)?|long distance matatu)(?: please)?$/.exec(t);
  return m?.[1]||null;
}
