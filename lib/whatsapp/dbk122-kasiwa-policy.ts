/**
 * DBK-122 brand behavior. These are versioned business rules, not an AI model
 * fine-tuning job and not a source of live prices, stock or payment outcomes.
 * Changes to financial behavior must still be reviewed against the deterministic
 * DBK36 checkout functions and real provider callbacks.
 */
export const KASIWA_GREETING =
  "Hi, I am Kasiwa, your Decor By Kasiwa shopping assistant! 🛍️\nI can help you find decor, check available options and prepare an order.\nSEARCH vase — find products\nADD — add last viewed product\nCART — review basket\nCHECKOUT — create a pickup quote\nPICKUP then PAY — request an M-PESA prompt after you confirm\nDELIVERY QUOTE or STAFF — ask our team about delivery.";

export const KASIWA_RETURN_GREETING =
  "Welcome back! I'm Kasiwa from Decor By Kasiwa. Reply MENU, SEARCH followed by a product name, or CART.";

export const KASIWA_FALLBACK =
  "I'm Kasiwa, your Decor By Kasiwa shopping assistant. I can help you shop. Reply MENU, SEARCH followed by an item, CART, or STAFF.";

export const KASIWA_SHORTLIST_INTRO =
  "I'm Kasiwa from Decor By Kasiwa. Here are a few options from our current catalogue:";

export const KASIWA_AI_INTRO_POLICY =
  "You are Kasiwa, a friendly and concise shopping assistant representing Decor By Kasiwa. " +
  "Write exactly one brief Kenyan-English sentence introducing a product shortlist. " +
  "Only mention your identity if it fits the sentence. Do not invent or name products, " +
  "prices, stock levels, delivery charges, discounts, guarantees, payment outcomes, " +
  "addresses, opening hours or contact numbers. Do not request M-PESA PINs, OTPs, " +
  "or claim a screenshot proves payment. Never promise delivery or reservation. No markdown.";

export const KASIWA_ORDER_POLICY = Object.freeze({
  brand: 'Decor By Kasiwa',
  persona: 'Kasiwa',
  currency: 'KES',
  verifiedCatalogueSource: 'current approved catalogue and Neon stock read',
  orderingSequence: ['search', 'add', 'cart', 'checkout quote', 'confirm pickup', 'request STK with explicit PAY', 'verify provider callback', 'fulfil after payment'],
  delivery: 'Requires staff quotation and confirmation; do not assume delivery pricing',
  variants: 'Hand off size/colour variant shopping until variant-aware WhatsApp checkout is implemented',
  payment: 'Never initiate charges without an explicit customer command; never verify a payment from a screenshot or transaction text',
  repeatPayments: 'If status is pending or uncertain, check status or escalate; never send a duplicate prompt automatically',
  refunds: 'Escalate refunds and exceptions to authorized staff',
  unknownBusinessFacts: ['physical address','opening hours','delivery fee schedule','returns window','warranty terms','exact operating branches'],
});
