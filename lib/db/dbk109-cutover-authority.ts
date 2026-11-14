/**
 * DBK-109: independent, fail-closed stock authority guard.
 * A partially configured channel must NEVER silently resume Sanity stock writes.
 * Deliberately pure: usable in server handlers and isolated node tests.
 */
export type DBK109Switches = Record<string, string | undefined>;

export function dbk109NeonAuthorityRequested(env: DBK109Switches = process.env): boolean {
  return env.DBK101_POS_NEON_REQUIRED === 'YES' ||
    env.DBK102_OPERATIONAL_NEON_ONLY === 'YES' ||
    env.DBK62_POS_BACKEND === 'neon' ||
    env.DBK68_MPESA_BACKEND === 'neon' ||
    env.DBK64_ONLINE_BACKEND === 'neon' ||
    env.DBK_INVENTORY_BACKEND === 'neon';
}

/** Return true when legacy inventory mutations must be blocked rather than attempted. */
export function dbk109LegacyInventoryWriteBlocked(env: DBK109Switches = process.env): boolean {
  return dbk109NeonAuthorityRequested(env) && env.DBK_INVENTORY_BACKEND !== 'neon';
}
