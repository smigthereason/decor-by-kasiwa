/** DBK-36D: WhatsApp Cloud API presentation helpers. Pure: no network, secrets or database. */
import { createHash } from 'node:crypto';
import {
  cleanLabel, pageOf, priceText, type CatalogueItem,
} from './browse-core';

export const DBK36_ACTION = 'dbk36:';

export type InteractiveRow = { id: string; title: string; description?: string };
export type WhatsAppInteractive =
  | {
      type: 'button';
      body: { text: string };
      header?: { type: 'image'; image: { link: string } };
      footer?: { text: string };
      action: { buttons: Array<{ type: 'reply'; reply: { id: string; title: string } }> };
    }
  | {
      type: 'list';
      body: { text: string };
      header?: { type: 'text'; text: string };
      footer?: { text: string };
      action: { button: string; sections: Array<{ title: string; rows: InteractiveRow[] }> };
    };

type Action = 'shop' | 'services' | 'staff' | 'search' | 'delivery' | 'tracking' |
  'quote' | 'menu' | 'next' | 'prev' | 'back' | 'categories' | 'results';
const ACTIONS = new Set<Action>([
  'shop', 'services', 'staff', 'search', 'delivery', 'tracking', 'quote',
  'menu', 'next', 'prev', 'back', 'categories', 'results',
]);

export function actionId(action: Action): string { return `${DBK36_ACTION}${action}`; }
export function parseAction(text: string): Action | null {
  if (!text.startsWith(DBK36_ACTION)) return null;
  const value = text.slice(DBK36_ACTION.length) as Action;
  return ACTIONS.has(value) ? value : null;
}

/** Indexed selections are bound to a page and an item fingerprint. Old buttons cannot select the wrong item. */
export function selectionId(kind: 'c' | 'p', page: number, index: number, itemId: string): string {
  const fingerprint = createHash('sha256').update(itemId).digest('hex').slice(0, 8);
  return `${DBK36_ACTION}${kind}:${page}:${index}:${fingerprint}`;
}
export function parseSelection(text: string): { kind: 'c' | 'p'; page: number; index: number; fingerprint: string } | null {
  const match = /^dbk36:(c|p):([0-9]{1,3}):([0-9]{1,2}):([a-f0-9]{8})$/.exec(text);
  if (!match) return null;
  return { kind: match[1] as 'c' | 'p', page: Number(match[2]),
    index: Number(match[3]), fingerprint: match[4] };
}
export function selectionMatches(text: string, kind: 'c' | 'p', page: number, index: number, itemId: string): boolean {
  return text === selectionId(kind, page, index, itemId);
}

const button = (id: Action, title: string) => ({ type: 'reply' as const, reply: { id: actionId(id), title } });
const row = (id: Action, title: string, description?: string): InteractiveRow =>
  ({ id: actionId(id), title, ...(description ? { description } : {}) });

/** Four visible choices exceed WhatsApp's three quick-reply buttons, so use a list. */
export function mainMenu(): WhatsAppInteractive {
  return {
    type: 'list',
    header: { type: 'text', text: 'Decor By Kasiwa 🏡' },
    body: { text: 'Welcome! Explore our home décor collection, search by product name, or speak with our team.\n\nWhat would you like to do?' },
    footer: { text: 'You can type MENU whenever you need this list.' },
    action: { button: 'Choose an option', sections: [{ title: 'How can we help?', rows: [
      row('shop', 'Shop products', 'Browse categories and view products'),
      row('search', 'Search by product name', 'Type a name or keywords to find an item'),
      row('services', 'Orders & delivery', 'Delivery, tracking and quotations'),
      row('staff', 'Talk to our team', 'Request assistance from our staff'),
    ] }] },
  };
}

export function servicesMenu(): WhatsAppInteractive {
  return {
    type: 'list',
    header: { type: 'text', text: 'How can we help?' },
    body: { text: 'Choose a service below. You can return to the main menu any time.' },
    footer: { text: 'Decor By Kasiwa' },
    action: { button: 'Choose a service', sections: [{ title: 'Customer support', rows: [
      row('delivery', 'Delivery & pickup', 'View delivery options'),
      row('tracking', 'Track an order', 'Open our order tracking page'),
      row('quote', 'Custom quotation', 'Speak with our team about a custom request'),
      row('shop', 'Shop products', 'Browse available catalogue categories'),
      row('menu', 'Main menu'),
    ] }] },
  };
}

const concise = (text: string, max: number) => cleanLabel(text, max).slice(0, max);

export function categoryList(names: string[], page: number): WhatsAppInteractive {
  const current = pageOf(names, page);
  const rows: InteractiveRow[] = current.items.map((name, index) => ({
    id: selectionId('c', current.page, index, name),
    title: concise(name, 24),
    description: 'Browse products in this category',
  }));
  if (current.page > 0) rows.push(row('prev', '◀ Previous page'));
  if (current.page < current.pages - 1) rows.push(row('next', 'Next page ▶'));
  rows.push(row('menu', 'Main menu'));
  return {
    type: 'list',
    header: { type: 'text', text: `Shop by category (${current.page + 1}/${current.pages})` },
    body: { text: `${names.length} categories available. Pick a category, or type a product name to search directly.` },
    footer: { text: 'Prices & availability verified at checkout' },
    action: { button: 'View categories', sections: [{ title: 'Categories', rows }] },
  };
}

export function productList(items: CatalogueItem[], page: number, heading: string): WhatsAppInteractive {
  const current = pageOf(items, page);
  const rows: InteractiveRow[] = current.items.map((item, index) => ({
    id: selectionId('p', current.page, index, item.id),
    title: concise(item.name, 24),
    description: priceText(item.price).slice(0, 72),
  }));
  if (current.page > 0) rows.push(row('prev', '◀ Previous page'));
  if (current.page < current.pages - 1) rows.push(row('next', 'Next page ▶'));
  rows.push(row('categories', 'All categories'));
  return {
    type: 'list',
    header: { type: 'text', text: concise(heading, 60) || 'Products' },
    body: { text: `${items.length} available items · Page ${current.page + 1}/${current.pages}\nSelect a product to see its price, details and shop link.` },
    footer: { text: 'Final prices and stock confirmed at checkout' },
    action: { button: 'View products', sections: [{ title: 'Available products', rows }] },
  };
}

export function detailButtons(item: CatalogueItem, base: string): WhatsAppInteractive {
  const desc = item.description ? `\n${concise(item.description, 280)}` : '';
  const body = `*${concise(item.name, 110)}*\n${priceText(item.price)} · ${concise(item.category, 90)}${desc}\n\nShop: ${base}/shop/${encodeURIComponent(item.slug)}\n\nPrice and availability are confirmed at checkout.`;
  const image = item.imageUrl && isSafePublicImageUrl(item.imageUrl)
    ? { header: { type: 'image' as const, image: { link: item.imageUrl } } } : {};
  return {
    type: 'button', ...image,
    body: { text: body.slice(0, 1024) },
    footer: { text: 'Orders and payments remain on our secure website' },
    action: { buttons: [
      button('results', 'Back to results'),
      button('categories', 'Other categories'),
      button('staff', 'Talk to our team'),
    ] },
  };
}

/** Public product media only; never send private URLs, tokens or unsupported formats to Meta. */
export function isSafePublicImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1800) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.searchParams.has('token')) return false;
    const trusted = ['cdn.sanity.io', 'decorbykasiwa.co.ke', 'www.decorbykasiwa.co.ke'];
    return trusted.includes(url.hostname.toLowerCase()) && /\.(?:jpe?g|png)$/i.test(url.pathname);
  } catch { return false; }
}

export function searchPrompt(): WhatsAppInteractive {
  return {
    type: 'button',
    body: { text: '*Find a product 🔎*\n\nType the product name or a few keywords (e.g. `mirrors` or `vases`). I’ll search our current catalogue.' },
    action: { buttons: [button('shop', 'Browse categories'), button('menu', 'Main menu')] },
  };
}
