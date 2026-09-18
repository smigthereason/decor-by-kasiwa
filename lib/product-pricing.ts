export type PriceableProduct = {
  slug?: string;
  name?: string;
  price?: number;
  wholesalePrice?: number;
  wholesaleMinQuantity?: number;
};

// Legacy fallback kept so the existing A4 portrait quantity offer continues
// until that product is saved with the new configurable wholesale fields.
const A4_PORTRAITS_SLUG = "a4-portraits";
const A4_PORTRAITS_SINGLE_PRICE = 300;
const A4_PORTRAITS_BULK_MINIMUM = 5;
const A4_PORTRAITS_BULK_PRICE = 200;

export function getWholesaleTier(product: PriceableProduct) {
  const wholesalePrice = Number(product.wholesalePrice || 0);
  const wholesaleMinQuantity = Math.floor(Number(product.wholesaleMinQuantity || 0));

  if (wholesalePrice > 0 && wholesaleMinQuantity >= 2) {
    return { wholesalePrice, wholesaleMinQuantity };
  }

  if (product.slug === A4_PORTRAITS_SLUG) {
    return {
      wholesalePrice: A4_PORTRAITS_BULK_PRICE,
      wholesaleMinQuantity: A4_PORTRAITS_BULK_MINIMUM,
    };
  }

  return null;
}

export function getRetailUnitPrice(product: PriceableProduct, variantPrice?: number) {
  return typeof variantPrice === "number" && variantPrice > 0
    ? variantPrice
    : Number(product.price || 0);
}

export function getQuantityUnitPrice(
  product: PriceableProduct,
  quantity: number,
  variantPrice?: number,
) {
  const retailPrice = getRetailUnitPrice(product, variantPrice);
  const tier = getWholesaleTier(product);

  if (tier && quantity >= tier.wholesaleMinQuantity) return tier.wholesalePrice;
  return retailPrice;
}

export function getQuantityLineTotal(
  product: PriceableProduct,
  quantity: number,
  variantPrice?: number,
) {
  return getQuantityUnitPrice(product, quantity, variantPrice) * quantity;
}

export function getQuantityPricingMessage(product: PriceableProduct) {
  const tier = getWholesaleTier(product);
  if (!tier) return null;
  const retailPrice = Number(product.price || 0);
  if (!(retailPrice > 0)) return null;
  return `KES ${retailPrice.toLocaleString("en-KE")} each · Buy ${tier.wholesaleMinQuantity}+ for KES ${tier.wholesalePrice.toLocaleString("en-KE")} each`;
}
