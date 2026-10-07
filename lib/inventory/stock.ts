export type StockVariant = {
  _key?: string;
  title?: string;
  colour?: string;
  size?: string;
  sku?: string;
  price?: number | null;
  stockQuantity?: number | null;
};

function nonNegativeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function hasVariants(
  variants: StockVariant[] | null | undefined,
): variants is StockVariant[] {
  return Array.isArray(variants) && variants.length > 0;
}

export function variantStockTotal(variants: StockVariant[] | null | undefined) {
  if (!hasVariants(variants)) return 0;
  return variants.reduce(
    (total, variant) => total + nonNegativeNumber(variant.stockQuantity),
    0,
  );
}

export function effectiveOnHand(
  initialStock: number | null | undefined,
  variants: StockVariant[] | null | undefined,
) {
  return hasVariants(variants)
    ? variantStockTotal(variants)
    : nonNegativeNumber(initialStock);
}

export function variantLabel(variant: StockVariant) {
  const title = variant.title?.trim();
  if (title) return title;

  const attributes = [variant.colour, variant.size]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (attributes.length > 0) return attributes.join(" · ");

  const sku = variant.sku?.trim();
  return sku || "Variant";
}
