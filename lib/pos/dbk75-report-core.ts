/** DBK-75 pure, fail-closed reconciliation utilities. No database access. */
export type ReportOrderIdentity = { id: string; paymentReference?: string };
export function distinctReportOrders<T extends ReportOrderIdentity>(legacy: T[], neon: T[]): T[] {
  const ids = new Set<string>();
  const legacyReferences = new Set<string>();
  for (const item of legacy) {
    if (!item.id || ids.has(item.id)) throw new Error('DBK-75 duplicate/missing Sanity order ID: report blocked');
    ids.add(item.id);
    if (item.paymentReference?.trim()) legacyReferences.add(item.paymentReference.trim());
  }
  const neonReferences = new Set<string>();
  for (const item of neon) {
    if (!item.id || ids.has(item.id)) throw new Error('DBK-75 overlapping order ID: report blocked');
    ids.add(item.id);
    const ref = item.paymentReference?.trim();
    if (ref) {
      if (legacyReferences.has(ref) || neonReferences.has(ref)) {
        throw new Error('DBK-75 overlapping payment reference: report blocked');
      }
      neonReferences.add(ref);
    }
  }
  return [...legacy, ...neon];
}
export function kesMinor(raw: number | string): number {
  const value = String(raw);
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 1_000_000_000_000) {
    throw new Error('DBK-75 invalid financial amount: report blocked');
  }
  return Number(value) / 100;
}
export function requireCompletePage(length: number, cap: number, label: string): void {
  if (!Number.isSafeInteger(length) || length < 0 || length > cap) {
    throw new Error(`DBK-75 ${label} exceeds ${cap} rows; pagination required before report activation`);
  }
}
export function withinWindow(date: string | Date | null | undefined, start: string, end: string): boolean {
  if (!date) return false;
  const time = new Date(date).getTime();
  return Number.isFinite(time) && time >= new Date(start).getTime() && time <= new Date(end).getTime();
}
