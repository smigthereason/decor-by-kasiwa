/**
 * DBK-36B: deterministic WhatsApp sales flows. No LLM, paid AI API, or secret required.
 * All prices/stock come from the existing catalogue; no order or payment writes.
 */
import type { StoreProduct } from '@/types/commerce';
import type { DeliveryZone } from '@/lib/shipping';

export type SalesIntent = 'menu' | 'browse' | 'delivery' | 'tracking' | 'checkout' | 'handover' | 'thanks' | 'search';

const normalize = (text: string): string => text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function isHandoverRequest(text: string): boolean {
  const s = normalize(text);
  return /^(?:4|5)$/.test(s)
    || /\b(human|real person|salesperson|customer service|staff|representative|speak to (?:a |an |the )?(?:person|agent|human)|talk to (?:a |an |the )?(?:person|agent|human)|custom(?:ise|ize|ised|ized)?|personaliz(?:ed|ation|e)|personal(?:ised|ized)|bespoke|refund|complaint|damaged|broken item)\b/.test(s)
    || /(?:ongea|zungumza) na (?:mtu|mhudumu)/.test(s);
}

export function classifySalesIntent(text: string): SalesIntent {
  const s = normalize(text);
  if (isHandoverRequest(text)) return 'handover';
  if (!s || /^(?:0|menu|help|start|hi|hello|hey|habari|mambo|sasa|good morning|good afternoon|good evening|hello there|hi there)[.!?]*$/.test(s)) return 'menu';
  if (/^(?:1|shop|browse|catalogue|catalog|products|product|what do you sell|show me products|show me your products|what products do you have)$/.test(s)) return 'browse';
  if (s === '2' || /\b(deliver(?:y|ies)?|shipping|ship to|pickup|pick up|collection|dispatch|courier|delivery fee|shipping cost)\b/.test(s)) return 'delivery';
  if (s === '3' || /\b(track(?:ing)?|order status|where is my order|order number|my order|check my order)\b/.test(s)) return 'tracking';
  if (/\b(checkout|how (?:do i|can i) pay|payment method|pay for|paystack|m-?pesa|buy online|place an order|purchase)\b/.test(s)) return 'checkout';
  if (/^(?:thanks|thank you|asante|thank you so much|okay thanks|ok thanks)[.!]*$/.test(s)) return 'thanks';
  return 'search';
}

/** No stock claims for zero-stock products, no price guessing and no duplicate results. */
export function findCatalogueProducts(products: StoreProduct[], searchText: string, browse = false): StoreProduct[] {
  const eligible = products.filter(p =>
    p.ecommerceEnabled !== false && p.available !== false && p.stockQuantity !== 0 &&
    Number.isFinite(p.price) && p.price > 0 && p.slug?.length > 0,
  );
  if (browse) {
    return [...eligible].sort((a, b) => Number(!!b.featured || !!b.bestSeller) - Number(!!a.featured || !!a.bestSeller)).slice(0, 4);
  }
  const ignored = new Set([
    'hi','hello','hey','please','could','can','show','find','me','i','my','we','want','need','looking','for','some','something',
    'price','prices','cost','how','much','is','are','a','an','the','of','in','at','do','you','have','with','about','and','or','to',
    'buy','sell','available','availability','stock','your','these','this','any','what','which','would','like',
    'nataka','naomba','mna','kuna','bei','ya','za','ni','na','hii','hizo','vitu',
  ]);
  const terms = [...new Set(normalize(searchText).match(/[a-z\d]{2,}/g) || [])].filter(t => !ignored.has(t)).slice(0, 10);
  if (!terms.length) return [];
  return eligible.map(p => {
    const name = p.name.toLowerCase();
    const category = p.category.toLowerCase();
    const description = (p.description || '').toLowerCase();
    const score = terms.reduce((sum, term) => sum
      + (name.includes(term) ? 8 : 0)
      + (category.includes(term) ? 4 : 0)
      + (description.includes(term) ? 1 : 0), 0);
    return { p, score };
  }).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, 4).map(result => result.p);
}

function money(price: number): string {
  return `KES ${price.toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

export function salesMenu(): string {
  return 'Welcome to *Decor By Kasiwa*! 🏡\n\nReply with a number:\n1. Browse products\n2. Delivery & pickup\n3. Track an order\n4. Custom order / quotation\n5. Speak with our team\n\nOr type a product name (e.g. *mirrors*).\nReply *MENU* at any time.';
}

export function productReply(matches: StoreProduct[], base: string, browse: boolean): string {
  if (!matches.length) {
    return browse
      ? `Our online catalogue is currently unavailable or has no listed items. Browse ${base}/shop or reply 5 to contact our team.\n\nReply MENU for options.`
      : `I couldn't find a matching item in our current online catalogue. Try a more specific name (e.g. *mirrors* or *cushions*), browse ${base}/shop, or reply 5 for staff assistance.\n\nReply MENU for options.`;
  }
  const intro = browse ? '*Browse our current products:*' : '*Matching products:*';
  const lines = matches.map((p, index) => `${index + 1}. *${p.name}* — ${money(p.price)}\n${base}/shop/${encodeURIComponent(p.slug)}`);
  return `${intro}\n\n${lines.join('\n\n')}\n\nPrices and availability are confirmed at checkout. Open a product link to select options and buy.\nReply MENU for more options.`;
}

export function deliveryReply(zones: DeliveryZone[], base: string): string {
  if (!zones.length) return `Delivery options need to be confirmed by our team. View ${base}/delivery or reply 5 to speak with staff.`;
  const lines = zones.slice(0, 12).map(zone => {
    const price = zone.quoteRequired ? 'quote required' : zone.fee === 0 ? 'No fee listed' : money(zone.fee);
    return `• ${zone.label}: ${price}`;
  });
  return `*Delivery & pickup options*\n\n${lines.join('\n')}\n\nFinal availability and charges are confirmed at checkout or by our team.\n${base}/delivery\n\nReply MENU for more options.`;
}

export function fixedReply(intent: SalesIntent, base: string): string {
  switch (intent) {
    case 'menu': return salesMenu();
    case 'tracking': return `You can check the status of your online order here:\n${base}/track-order\n\nIf you need staff assistance, reply 5.\nReply MENU for options.`;
    case 'checkout': return `To purchase, open a product link or browse ${base}/shop, add the items to your cart, and complete payment through the secure website checkout.\n\nI cannot create an order, collect payment details or confirm a payment in this chat.\nReply MENU for options.`;
    case 'thanks': return 'You’re welcome! Reply MENU whenever you need product or delivery information.';
    case 'handover': return 'I’ve marked this chat for staff assistance. A member of the team can continue with you here when available. Please don’t send your PIN, OTP or card details.';
    default: return salesMenu();
  }
}
