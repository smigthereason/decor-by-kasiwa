/**
 * Convert a mobile-friendly positive quantity into an authorized signed operation.
 * Reductions use the same audited backend path as entering a negative value.
 */
export function inventoryQuantityFromMagnitude(raw: string, reduceStock: boolean): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) return null;
  return reduceStock ? -amount : amount;
}
