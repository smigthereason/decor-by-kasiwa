import 'server-only';
import { isHandoverRequest, classifySalesIntent, fixedReply } from './rules';
import { generateSalesReply } from './agent';
import { getBrowseState, saveBrowseState, clearBrowseState, type BrowseState } from './browse-state';
import { readWhatsAppCatalogue } from './catalogue-cache';
import {
  categories, categoryProducts, rankedProducts, pageOf, PAGE_SIZE,
  categoryMessage, productsMessage, productDetail, type CatalogueItem,
} from './browse-core';
import {
  mainMenu, servicesMenu, categoryList, productList, detailButtons, searchPrompt,
  parseAction, parseSelection, selectionMatches, type WhatsAppInteractive,
} from './interactive-core';

export type SalesFlowResult = { reply: string; handover: boolean; interactive?: WhatsAppInteractive };

/** All product lookups use the validated Neon snapshot, never Sanity on inbound messages. */
export async function handleSalesFlow(waId: string, customerText: string): Promise<SalesFlowResult> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.decorbykasiwa.co.ke').replace(/\/+$/, '');
  const text = customerText.trim();
  const lower = text.toLowerCase();
  const action = parseAction(text);
  const selection = parseSelection(text);
  const done = (reply: string, interactive?: WhatsAppInteractive): SalesFlowResult =>
    ({ reply, handover: false, ...(interactive ? { interactive } : {}) });
  const menu = async (): Promise<SalesFlowResult> => {
    await clearBrowseState(waId);
    const interactive = mainMenu();
    return done(interactive.body.text, interactive);
  };

  if (/^(menu|start|help|0)$/i.test(text) || action === 'menu') return menu();
  const state = await getBrowseState(waId);
  // A displayed 4 or 5 (or 6/7) selects an item while browsing, never a staff action.
  // Outside browsing, preserve the legacy 4/5 handover commands.
  const selectingNumber = !!state && /^[1-7]$/.test(text);
  if (action === 'staff' || action === 'quote' || (isHandoverRequest(text) && !selectingNumber)) {
    await clearBrowseState(waId);
    return { reply: fixedReply('handover', base), handover: true };
  }
  if (action === 'services') return done('Choose a service below.', servicesMenu());
  if (action === 'search' || /^(?:search|search products?|find (?:a )?product)$/i.test(text)) {
    // A new search starts independently of a previously selected category/page.
    await clearBrowseState(waId);
    const interactive = searchPrompt();
    return done(interactive.body.text, interactive);
  }
  if (action === 'delivery') return done(await generateSalesReply('delivery'));
  if (action === 'tracking') return done(fixedReply('tracking', base));
  if (text.startsWith('dbk36:') && !action && !selection) {
    return done('That option is no longer available. Please use the latest menu.', mainMenu());
  }

  const intent = classifySalesIntent(text);
  if (intent === 'menu' && !action && !selection && !selectingNumber) return menu();
  const isNav = ['next', 'more', 'prev', 'previous', 'back', 'categories', 'results'].includes(lower)
    || ['next', 'prev', 'back', 'categories', 'results'].includes(action || '');
  const needsCatalogue = !!selection || selectingNumber || isNav || action === 'shop'
    || intent === 'browse' || intent === 'search';
  if (!needsCatalogue) return done(await generateSalesReply(text));

  const catalogue = await readWhatsAppCatalogue();
  if (!catalogue.products.length) {
    await clearBrowseState(waId);
    // Do not send the welcome buttons again: it looks as though the selection
    // was ignored, and traps the customer in a loop.
    return done(`Our WhatsApp catalogue is temporarily unavailable while it refreshes.\n\nYou can still shop at ${base}/shop or reply STAFF for help. Please try again shortly.`);
  }
  const staleNotice = catalogue.stale
    ? 'Our product list is being refreshed. Please confirm current prices and stock at checkout.\n\n'
    : '';
  const products = catalogue.products;
  const names = categories(products);
  const itemsFor = (current: BrowseState): CatalogueItem[] => current.category
    ? categoryProducts(products, current.category) : rankedProducts(products, current.query || '');
  const showCategories = async (page = 0, intro = ''): Promise<SalesFlowResult> => {
    const safe = pageOf(names, page).page;
    await saveBrowseState(waId, { mode: 'categories', category: null, query: null, page: safe });
    const interactive = categoryList(names, safe);
    if (intro || staleNotice) interactive.body.text = `${staleNotice}${intro}${interactive.body.text}`.slice(0, 1024);
    return done(`${staleNotice}${intro}${categoryMessage(names, safe, base)}`, interactive);
  };
  const showProducts = async (current: BrowseState, page = current.page, intro = ''): Promise<SalesFlowResult> => {
    const matches = itemsFor(current);
    if (!matches.length) return showCategories();
    const safe = pageOf(matches, page).page;
    await saveBrowseState(waId, { ...current, page: safe });
    const heading = current.category || `Search: ${current.query || ''}`;
    const interactive = productList(matches, safe, heading);
    if (intro || staleNotice) interactive.body.text = `${staleNotice}${intro}${interactive.body.text}`.slice(0, 1024);
    return done(`${staleNotice}${intro}${productsMessage(matches, safe, base, heading)}`, interactive);
  };
  const categoryPageOfSelection = () => state?.category
    ? Math.floor(Math.max(0, names.indexOf(state.category)) / PAGE_SIZE) : 0;

  if (action === 'categories' || lower === 'categories') return showCategories(categoryPageOfSelection());
  if (action === 'results' || lower === 'results') {
    return state?.mode === 'products' ? showProducts(state) : showCategories();
  }
  if (action === 'back' || lower === 'back') {
    if (state?.mode === 'categories') {
      return state.page > 0 ? showCategories(state.page - 1) : menu();
    }
    if (state?.mode === 'products') return showCategories(categoryPageOfSelection());
    return menu();
  }
  if (action === 'next' || action === 'prev' || lower === 'next' || lower === 'more' || lower === 'prev' || lower === 'previous') {
    if (!state) return showCategories();
    const delta = action === 'prev' || lower === 'prev' || lower === 'previous' ? -1 : 1;
    return state.mode === 'categories'
      ? showCategories(state.page + delta)
      : showProducts(state, state.page + delta);
  }

  if (selection || selectingNumber) {
    if (!state) return showCategories(0, 'That selection has expired. Please choose again.\n\n');
    const index = selection ? selection.index : Number(text) - 1;
    const stale = selection && (selection.page !== state.page
      || selection.kind !== (state.mode === 'categories' ? 'c' : 'p'));
    if (stale) {
      const intro = 'That selection has expired. Please use the current list.\n\n';
      return state.mode === 'categories' ? showCategories(state.page, intro) : showProducts(state, state.page, intro);
    }
    if (state.mode === 'categories') {
      const chosen = pageOf(names, state.page).items[index];
      if (!chosen || (selection && !selectionMatches(text, 'c', state.page, index, chosen))) {
        return showCategories(state.page, 'Please select an option from the latest list.\n\n');
      }
      return showProducts({ mode: 'products', category: chosen, query: null, page: 0 });
    }
    const chosen = pageOf(itemsFor(state), state.page).items[index];
    if (!chosen || (selection && !selectionMatches(text, 'p', state.page, index, chosen.id))) {
      return showProducts(state, state.page, 'Please select a product from the latest list.\n\n');
    }
    // Keep the parent product list in Neon; Back to results restores exactly that page.
    const detail = detailButtons(chosen, base);
    if (catalogue.stale) detail.body.text = `${detail.body.text}\n\nConfirm current stock and price at checkout.`.slice(0, 1024);
    return done(`${staleNotice}${productDetail(chosen, base)}`, detail);
  }

  if (action === 'shop' || intent === 'browse') return showCategories();
  const query = text.replace(/^search\s+/i, '').slice(0, 90);
  if (!query.trim()) return done('Type a product name to search our catalogue.', searchPrompt());
  const matches = rankedProducts(products, query);
  if (!matches.length) {
    await clearBrowseState(waId);
    return done(`No matching products found for *${query.replace(/[\r\n*`]/g, ' ').slice(0, 60)}*. Try different keywords, browse ${base}/shop or reply STAFF for assistance.`, searchPrompt());
  }
  return showProducts({ mode: 'products', category: null, query, page: 0 });
}
