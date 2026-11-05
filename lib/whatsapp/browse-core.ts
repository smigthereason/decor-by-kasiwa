/** DBK-36C: pure, deterministic catalogue browsing. No Sanity or network operations. */
export type CatalogueItem = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  stockQuantity: number | null;
  featured: boolean;
  bestSeller: boolean;
  imageUrl?: string;
};

export const PAGE_SIZE = 7;

export function cleanLabel(value: unknown, limit = 100): string {
  return typeof value === 'string'
    ? value.replace(/[\r\n\t*`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : '';
}

/** Store only eligible products; do not promise stock is reserved. */
export function catalogueItem(raw: unknown): CatalogueItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const name = cleanLabel(p.name, 110);
  const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
  const id = typeof p.id === 'string' ? p.id.trim() : String(p.id ?? '').trim();
  const price = Number(p.price);
  const stock = p.stockQuantity === null || p.stockQuantity === undefined ? null : Number(p.stockQuantity);
  if (!name || !id || !slug || !/^[\w-]+$/.test(slug) ||
      !Number.isFinite(price) || price <= 0 || p.ecommerceEnabled === false ||
      p.available === false || stock === 0 || (stock !== null && (!Number.isFinite(stock) || stock < 0))) return null;
  // Use only public first-party/Sanity image URLs. If absent, buttons stay text-only.
  const imageCandidates: unknown[] = [p.imageUrl, p.thumbnailUrl, p.image, p.mainImage,
    ...(Array.isArray(p.images) ? p.images.slice(0, 2) : [])];
  let imageUrl: string | undefined;
  for (const candidate of imageCandidates) {
    const media = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
    const asset = media?.asset && typeof media.asset === 'object'
      ? media.asset as Record<string, unknown> : null;
    const value = typeof candidate === 'string' ? candidate
      : (media?.url ?? media?.imageUrl ?? asset?.url);
    if (typeof value !== 'string' || value.length > 1800) continue;
    try {
      const uri = new URL(value);
      if (uri.protocol === 'https:' && !uri.username && !uri.password &&
          ['cdn.sanity.io','decorbykasiwa.co.ke','www.decorbykasiwa.co.ke'].includes(uri.hostname.toLowerCase()) &&
          /\.(?:jpe?g|png)$/i.test(uri.pathname) && !uri.searchParams.has('token')) {
        imageUrl = uri.toString(); break;
      }
    } catch { /* Ignore untrusted or malformed media URLs. */ }
  }
  return {
    id, name, slug,
    category: cleanLabel(p.category, 90) || 'Other',
    description: cleanLabel(p.description, 280),
    price, stockQuantity: stock,
    featured: p.featured === true, bestSeller: p.bestSeller === true,
    ...(imageUrl ? {imageUrl} : {}),
  };
}

export function categories(products: CatalogueItem[]): string[] {
  return [...new Set(products.map(p => p.category))].sort((a, b) => a.localeCompare(b));
}

export function rankedProducts(products: CatalogueItem[], query: string): CatalogueItem[] {
  const stop = new Set(['please','could','show','find','me','i','my','we','want','need','looking','for','some','price','prices','how','much','is','are','a','an','the','of','in','at','do','you','have','with','and','or','to','your','what','any','nataka','naomba','mna','kuna','bei','ya','za']);
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{2,}/g) || [])]
    .filter(term => !stop.has(term)).slice(0, 8);
  if (!terms.length) return [];
  return products.map(product => {
    const n = product.name.toLowerCase();
    const c = product.category.toLowerCase();
    const d = product.description.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (n.includes(term) ? 8 : 0)
      + (c.includes(term) ? 4 : 0) + (d.includes(term) ? 1 : 0), 0);
    return { product, score };
  }).filter(p => p.score > 0).sort((a,b) => b.score-a.score || a.product.name.localeCompare(b.product.name))
    .map(p => p.product);
}

export function categoryProducts(products: CatalogueItem[], category: string): CatalogueItem[] {
  return products.filter(p => p.category === category).sort((a,b) =>
    Number(b.featured || b.bestSeller) - Number(a.featured || a.bestSeller) || a.name.localeCompare(b.name));
}

export function pageOf<T>(items: T[], page: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Number.isInteger(page) ? Math.max(0, Math.min(page, pages-1)) : 0;
  return {items:items.slice(safePage*PAGE_SIZE,(safePage+1)*PAGE_SIZE), page:safePage, pages};
}

export function priceText(price: number): string {
  return `KES ${price.toLocaleString('en-KE',{maximumFractionDigits:2})}`;
}

export function categoryMessage(names: string[], page: number, base: string): string {
  if (!names.length) return `The catalogue has no categories right now. Browse ${base}/shop or reply 5 for staff assistance.`;
  const result=pageOf(names,page);
  const listing=result.items.map((name,i)=>`${i+1}. ${name}`).join('\n');
  return `*Shop by category* (${result.page+1}/${result.pages})\n\n${listing}\n\nReply with 1–${result.items.length} or use the WhatsApp list.\nNEXT — more categories | BACK — previous page\nMENU — main menu | STAFF — team`;
}

export function productsMessage(items: CatalogueItem[], page: number, base: string, heading: string): string {
  const result=pageOf(items,page);
  if (!items.length) return `No available products found for *${cleanLabel(heading)}*. Try another search or browse ${base}/shop.\nMENU — restart | 5 — staff`;
  const listing=result.items.map((p,i)=> `${i+1}. *${p.name}* — ${priceText(p.price)}\n${base}/shop/${encodeURIComponent(p.slug)}`).join('\n\n');
  return `*${cleanLabel(heading)}* (${result.page+1}/${result.pages}, ${items.length} items)\n\n${listing}\n\nReply 1–${result.items.length} for details, or use the WhatsApp list.\nNEXT — more | CATEGORIES — all categories\nPrices and stock confirmed at checkout. MENU — main menu | STAFF — team`;
}

export function productDetail(item: CatalogueItem, base: string): string {
  return `*${item.name}*\n${item.category}\n${priceText(item.price)}\n${item.description ? `\n${item.description}\n` : ''}\n${base}/shop/${encodeURIComponent(item.slug)}\n\nPrices and availability are confirmed at checkout. Choose Back to results to see the product list, or MENU for the main menu.`;
}
