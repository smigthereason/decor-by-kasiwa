/** DBK-142: pure validation for registering a NEW product without minting stock. */
export function dbk142ZeroStockKeys(input: {
  storeLocationId:string;
  variantIds:string[];
  initialStock:number;
  incoming:number;
  variantStock:number[];
}): string[] {
  if (!input.storeLocationId || !/^[A-Za-z0-9._-]{1,200}$/.test(input.storeLocationId)) {
    throw new Error('Choose a valid inventory location.');
  }
  if (input.initialStock !== 0 || input.incoming !== 0 ||
      input.variantStock.some(q => q !== 0)) {
    throw new Error('New products must start with zero stock.');
  }
  if (input.variantIds.length > 100 || input.variantIds.some(id =>
    !/^[A-Za-z0-9._-]{1,100}$/.test(id) ||
    id === '__UNALLOCATED_VARIANT__' || id === '__UNALLOCATED__') ||
    new Set(input.variantIds).size !== input.variantIds.length) {
    throw new Error('Invalid variant identifiers.');
  }
  return input.variantIds.length ? [...input.variantIds] : [''];
}
