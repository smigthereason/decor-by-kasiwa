export type PriceableProduct = {
  slug?: string;
  name?: string;
  price?: number;
};

const A4_PORTRAITS_SLUG = "a4-portraits";
const A4_PORTRAITS_SINGLE_PRICE = 300;
const A4_PORTRAITS_BULK_MINIMUM = 5;
const A4_PORTRAITS_BULK_PRICE = 200;

export function hasA4PortraitTierPricing(product: PriceableProduct) {
  return product.slug === A4_PORTRAITS_SLUG;
}

export function getQuantityUnitPrice(
  product: PriceableProduct,
  quantity: number,
  variantPrice?: number,
) {
  if (hasA4PortraitTierPricing(product)) {
    return quantity >= A4_PORTRAITS_BULK_MINIMUM
      ? A4_PORTRAITS_BULK_PRICE
      : A4_PORTRAITS_SINGLE_PRICE;
  }

  return typeof variantPrice === "number" ? variantPrice : Number(product.price || 0);
}

export function getQuantityLineTotal(
  product: PriceableProduct,
  quantity: number,
  variantPrice?: number,
) {
  return getQuantityUnitPrice(product, quantity, variantPrice) * quantity;
}

export function getQuantityPricingMessage(product: PriceableProduct) {
  if (!hasA4PortraitTierPricing(product)) return null;
  return `KES ${A4_PORTRAITS_SINGLE_PRICE} each · Buy ${A4_PORTRAITS_BULK_MINIMUM}+ for KES ${A4_PORTRAITS_BULK_PRICE} each`;
}
