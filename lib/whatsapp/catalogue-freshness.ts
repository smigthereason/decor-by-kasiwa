/** DBK-36 catalogue age policy. No database, network, or secrets. */
export type CatalogueFreshness = 'fresh' | 'stale' | 'expired';

export function classifyCatalogueFreshness(
  syncedAt: unknown,
  nowMs: number,
  freshMinutes = 60,
  graceMinutes = 360,
): CatalogueFreshness {
  const stamp = syncedAt instanceof Date ? syncedAt.getTime()
    : typeof syncedAt === 'string' ? Date.parse(syncedAt) : NaN;
  if (!Number.isFinite(stamp) || !Number.isFinite(nowMs)) return 'expired';
  const ageMs = nowMs - stamp;
  if (ageMs < -60_000) return 'expired'; // Invalid/future cache; do not use.
  if (ageMs <= Math.max(1, freshMinutes) * 60_000) return 'fresh';
  const hardLimitMinutes = Math.min(1440, Math.max(1, freshMinutes) + Math.max(0, graceMinutes));
  return ageMs <= hardLimitMinutes * 60_000 ? 'stale' : 'expired';
}
