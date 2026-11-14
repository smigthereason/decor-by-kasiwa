import 'server-only';
import { neon } from '@neondatabase/serverless';

const PRODUCTION_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export type DBK109MaintenanceDecision = 'OPEN' | 'FROZEN' | 'UNAVAILABLE';

/**
 * The DBK-74 database flag is meaningful only when all checkout / stock write
 * entry points enforce it. This is checked before a NEW transaction is created.
 * Existing provider verification and callbacks deliberately do NOT use this
 * function: already-paid money must still be settled or reconciled.
 */
export async function dbk109MaintenanceDecision(): Promise<DBK109MaintenanceDecision> {
  if (process.env.VERCEL_ENV !== 'production') return 'OPEN';
  try {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error('Missing production Neon URL');
    const u = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
        u.hostname !== PRODUCTION_HOST || decodeURIComponent(u.pathname.slice(1)) !== 'neondb') {
      throw new Error('DBK-109 production identity mismatch');
    }
    const sql = neon(raw);
    const rows = await sql`SELECT active FROM public.dbk74_freeze_control WHERE singleton=true`;
    if (rows.length !== 1 || typeof rows[0].active !== 'boolean') {
      throw new Error('DBK-74 freeze control missing');
    }
    return rows[0].active ? 'FROZEN' : 'OPEN';
  } catch (cause) {
    console.error('[DBK109] Production write-freeze verification unavailable', cause);
    return 'UNAVAILABLE';
  }
}

export function dbk109FreezeMessage(state: DBK109MaintenanceDecision) {
  return state === 'FROZEN'
    ? 'A planned inventory/payment handover is active. No new sale or stock write was created.'
    : 'The production write-freeze status could not be verified. No new transaction was created.';
}
