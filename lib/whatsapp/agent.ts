import 'server-only';

import {
  classifySalesIntent, deliveryReply, findCatalogueProducts, fixedReply, productReply,
} from './rules';

/**
 * DBK-36B: free, rule-based sales assistant.
 * No OpenAI key, AI inference endpoint, or additional AI service required.
 * AI is a future enhancement, not a runtime fallback or hidden dependency.
 * This is read-only: checkout, inventory, payments and orders remain untouched.
 */
export async function generateSalesReply(customerText: string): Promise<string> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.decorbykasiwa.co.ke').replace(/\/+$/, '');
  const intent = classifySalesIntent(customerText);

  if (intent !== 'browse' && intent !== 'search' && intent !== 'delivery') {
    return fixedReply(intent, base);
  }
  if (intent === 'delivery') {
    try {
      // Delivery pricing is only needed for this intent; never load a write-token
      // dependent module during Meta's webhook verification handshake.
      const { getWhatsAppDeliveryZones } = await import('./delivery-reader');
      return deliveryReply(await getWhatsAppDeliveryZones(), base);
    }
    catch (error) {
      console.error('[DBK-36] Delivery lookup failed', error instanceof Error ? error.message : 'unknown');
      return `I couldn't retrieve the current delivery rates. Check ${base}/delivery or reply 5 to contact staff.`;
    }
  }
  try {
    // Lazy-load catalogue access only for product enquiries. The public
    // ecommerce reader uses Sanity CDN and needs no write token.
    const { getStoreProducts } = await import('@/sanity/lib/catalog');
    const products = await getStoreProducts('ecommerce');
    const browse = intent === 'browse';
    return productReply(findCatalogueProducts(products, customerText, browse), base, browse);
  } catch (error) {
    console.error('[DBK-36] Catalogue lookup failed', error instanceof Error ? error.message : 'unknown');
    return `I couldn't retrieve the current product catalogue. Please browse ${base}/shop or reply 5 for staff assistance.`;
  }
}
