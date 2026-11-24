/** Client-side checks that mirror the existing product creation rules.
 * Backend validation remains authoritative. No stock or pricing changes occur here.
 */
export type Dbk143Issue = {
  field: 'wholesalePrice' | 'wholesaleMinQuantity' | 'storeLocationId';
  message: string;
};

export function dbk143ProductCreatePreflight(input: {
  retailPrice: number;
  wholesalePrice: string;
  wholesaleMinQuantity: string;
  requiresInventoryLocation: boolean;
  storeLocationId: string;
}): Dbk143Issue | null {
  const priceText = input.wholesalePrice.trim();
  const minimumText = input.wholesaleMinQuantity.trim();
  if (priceText || minimumText) {
    const wholesale = Number(priceText);
    if (!priceText || !Number.isFinite(wholesale) || wholesale <= 0) {
      return {field:'wholesalePrice',message:'Enter a valid wholesale price, or clear both wholesale fields.'};
    }
    if (wholesale >= input.retailPrice) {
      return {field:'wholesalePrice',message:'Wholesale price must be lower than the retail price.'};
    }
    const minimum = Number(minimumText);
    if (!minimumText || !Number.isInteger(minimum) || minimum < 2) {
      return {field:'wholesaleMinQuantity',message:'Enter the minimum wholesale quantity (2 or more) when you set a wholesale price.'};
    }
  }
  if (input.requiresInventoryLocation && !input.storeLocationId.trim()) {
    return {field:'storeLocationId',message:'Select the store where this new product will be registered. Its starting stock will be zero.'};
  }
  return null;
}
