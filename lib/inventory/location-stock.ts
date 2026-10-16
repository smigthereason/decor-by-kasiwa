export type StoreRefSnapshot = {
  id: string;
  name: string;
  code?: string;
};

export type LocationVariantBalance = {
  _key?: string;
  variantId?: string;
  variantLabel?: string;
  onHand?: number | null;
  incoming?: number | null;
};

export type LocationBalance = {
  _key?: string;
  store?: { _type?: "reference"; _ref?: string } | null;
  storeId?: string;
  storeName?: string;
  storeCode?: string;
  onHand?: number | null;
  incoming?: number | null;
  variants?: LocationVariantBalance[] | null;
};

function nonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function keyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-24) || "location";
}

export function locationStoreId(balance: LocationBalance) {
  return balance.store?._ref || balance.storeId || "";
}

export function findLocationBalance(balances: LocationBalance[] | null | undefined, storeId: string) {
  return (balances || []).find((balance) => locationStoreId(balance) === storeId);
}

export function findVariantBalance(balance: LocationBalance | null | undefined, variantId?: string) {
  if (!balance || !variantId) return undefined;
  return (balance.variants || []).find((variant) => variant.variantId === variantId);
}

export function locationOnHand(balance: LocationBalance | null | undefined, variantId?: string) {
  if (!balance) return 0;
  if (variantId) return nonNegative(findVariantBalance(balance, variantId)?.onHand);
  return nonNegative(balance.onHand);
}

export function locationIncoming(balance: LocationBalance | null | undefined, variantId?: string) {
  if (!balance) return 0;
  if (variantId) return nonNegative(findVariantBalance(balance, variantId)?.incoming);
  return nonNegative(balance.incoming);
}

export function allocatedOnHand(balances: LocationBalance[] | null | undefined, variantId?: string) {
  return (balances || []).reduce((total, balance) => total + locationOnHand(balance, variantId), 0);
}

export function allocatedIncoming(balances: LocationBalance[] | null | undefined, variantId?: string) {
  return (balances || []).reduce((total, balance) => total + locationIncoming(balance, variantId), 0);
}

export function unallocatedOnHand(companyOnHand: number, balances: LocationBalance[] | null | undefined, variantId?: string) {
  return Math.max(0, nonNegative(companyOnHand) - allocatedOnHand(balances, variantId));
}

export function adjustLocationBalance(
  balances: LocationBalance[] | null | undefined,
  store: StoreRefSnapshot,
  change: {
    onHandDelta?: number;
    incomingDelta?: number;
    variantId?: string;
    variantLabel?: string;
  },
) {
  const next = [...(balances || [])].map((row) => ({ ...row, variants: row.variants ? [...row.variants] : [] }));
  let index = next.findIndex((row) => locationStoreId(row) === store.id);
  if (index < 0) {
    next.push({
      _key: `store-${keyPart(store.id)}`,
      store: { _type: "reference", _ref: store.id },
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      onHand: 0,
      incoming: 0,
      variants: [],
    });
    index = next.length - 1;
  }

  const row = { ...next[index] };
  row.store = { _type: "reference", _ref: store.id };
  row.storeId = store.id;
  row.storeName = store.name;
  row.storeCode = store.code;

  if (change.variantId) {
    const variants = [...(row.variants || [])];
    let variantIndex = variants.findIndex((variant) => variant.variantId === change.variantId);
    if (variantIndex < 0) {
      variants.push({
        _key: `variant-${keyPart(change.variantId)}`,
        variantId: change.variantId,
        variantLabel: change.variantLabel,
        onHand: 0,
        incoming: 0,
      });
      variantIndex = variants.length - 1;
    }
    const variant = { ...variants[variantIndex] };
    variant.variantLabel = change.variantLabel || variant.variantLabel;
    variant.onHand = Math.max(0, nonNegative(variant.onHand) + Number(change.onHandDelta || 0));
    variant.incoming = Math.max(0, nonNegative(variant.incoming) + Number(change.incomingDelta || 0));
    variants[variantIndex] = variant;
    row.variants = variants.filter((item) => nonNegative(item.onHand) > 0 || nonNegative(item.incoming) > 0);
    row.onHand = row.variants.reduce((total, item) => total + nonNegative(item.onHand), 0);
    row.incoming = row.variants.reduce((total, item) => total + nonNegative(item.incoming), 0);
  } else {
    row.onHand = Math.max(0, nonNegative(row.onHand) + Number(change.onHandDelta || 0));
    row.incoming = Math.max(0, nonNegative(row.incoming) + Number(change.incomingDelta || 0));
  }

  next[index] = row;
  return next.filter((item) => nonNegative(item.onHand) > 0 || nonNegative(item.incoming) > 0 || (item.variants || []).length > 0);
}
