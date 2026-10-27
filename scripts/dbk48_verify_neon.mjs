/* DBK-48A read-only verification. Example:
   node --env-file=.env.local scripts/dbk48_verify_neon.mjs
   Never prints connection strings or document bodies.
*/
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const sql = neon(url);
const existing = await sql`
  SELECT
    to_regclass('public.dbk_live_audit_events')::text AS live_table,
    to_regclass('public.dbk_sanity_operational_archive')::text AS snapshot_table`;
if (!existing[0]?.live_table || !existing[0]?.snapshot_table) {
  throw new Error('Required Neon schema missing. Apply DBK-48A SQL before enabling feature flag.');
}
const [summary, integrity, overlap] = await Promise.all([
  sql`SELECT
    COUNT(*)::int AS live_events,
    COUNT(DISTINCT id)::int AS unique_live_ids,
    MIN(created_at) AS oldest_live,
    MAX(created_at) AS newest_live
    FROM public.dbk_live_audit_events`,
  sql`SELECT COUNT(*)::int AS invalid_live_records
    FROM public.dbk_live_audit_events
    WHERE document_json->>'_type' IS DISTINCT FROM 'auditEvent'
       OR document_json->>'_id' IS DISTINCT FROM id
       OR document_json->>'eventType' IS NULL`,
  sql`SELECT COUNT(*)::int AS ids_also_in_snapshot
    FROM public.dbk_live_audit_events live
    JOIN public.dbk_sanity_operational_archive archive
      ON archive.document_type = 'auditEvent' AND archive.sanity_id = live.id`,
]);
const info = {stage:'DBK-48A', mode:'READ ONLY',
  liveEvents:Number(summary[0]?.live_events||0),
  uniqueLiveIds:Number(summary[0]?.unique_live_ids||0),
  invalidLiveRecords:Number(integrity[0]?.invalid_live_records||0),
  idsAlsoInSnapshot:Number(overlap[0]?.ids_also_in_snapshot||0),
  oldestLive:summary[0]?.oldest_live || null,
  newestLive:summary[0]?.newest_live || null,
  sanityWrites:0, stockWrites:0, paymentWrites:0, deletionPermission:false};
console.log(JSON.stringify(info,null,2));
if(info.invalidLiveRecords!==0 || info.liveEvents!==info.uniqueLiveIds) process.exitCode=1;
