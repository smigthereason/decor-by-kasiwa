export type PriceableProduct = {
  slug?: string;
  name?: string;
  price?: number;
  retailPrice?: number;
  compareAtPrice?: number;
  onSale?: boolean;
  salePrice?: number;
  saleStartAt?: string;
  saleEndAt?: string;
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

export function isSaleActive(product: PriceableProduct, now = Date.now()) {
  if (product.onSale !== true) return false;
  const start = product.saleStartAt ? new Date(product.saleStartAt).getTime() : Number.NEGATIVE_INFINITY;
  const end = product.saleEndAt ? new Date(product.saleEndAt).getTime() : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start) && product.saleStartAt) return false;
  if (!Number.isFinite(end) && product.saleEndAt) return false;
  return now >= start && now <= end;
}

export function getRetailUnitPrice(product: PriceableProduct, variantPrice?: number) {
  if (typeof variantPrice === "number" && variantPrice > 0) return variantPrice;
  const configuredRetail = Number(product.retailPrice || 0);
  return configuredRetail > 0 ? configuredRetail : Number(product.price || 0);
}

export function getActiveSaleUnitPrice(product: PriceableProduct, variantPrice?: number) {
  const retailPrice = getRetailUnitPrice(product, variantPrice);
  const salePrice = Number(product.salePrice || 0);
  if (isSaleActive(product) && salePrice > 0 && salePrice < retailPrice) return salePrice;
  return retailPrice;
}

export function getPriceComparison(product: PriceableProduct, variantPrice?: number) {
  const retailPrice = getRetailUnitPrice(product, variantPrice);
  const sellingPrice = getActiveSaleUnitPrice(product, variantPrice);
  const configuredCompareAt = Number(product.compareAtPrice || 0);
  const referencePrice = sellingPrice < retailPrice
    ? retailPrice
    : configuredCompareAt > retailPrice
      ? configuredCompareAt
      : undefined;
  const savingsPercent = referencePrice && referencePrice > sellingPrice
    ? Math.round(((referencePrice - sellingPrice) / referencePrice) * 100)
    : 0;
  const isActiveSale = sellingPrice < retailPrice;
  const savingsLabel = savingsPercent > 0
    ? isActiveSale
      ? `${savingsPercent}% off`
      : `Save ${savingsPercent}%`
    : null;
  return { sellingPrice, retailPrice, referencePrice, savingsPercent, isActiveSale, savingsLabel };
}

export function getQuantityUnitPrice(
  product: PriceableProduct,
  quantity: number,
  variantPrice?: number,
) {
  const sellingPrice = getActiveSaleUnitPrice(product, variantPrice);
  const tier = getWholesaleTier(product);

  if (tier && quantity >= tier.wholesaleMinQuantity) return Math.min(sellingPrice, tier.wholesalePrice);
  return sellingPrice;
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
  const retailPrice = getActiveSaleUnitPrice(product);
  if (!(retailPrice > 0) || tier.wholesalePrice >= retailPrice) return null;
  return `KES ${retailPrice.toLocaleString("en-KE")} each · Buy ${tier.wholesaleMinQuantity}+ for KES ${tier.wholesalePrice.toLocaleString("en-KE")} each`;
}
