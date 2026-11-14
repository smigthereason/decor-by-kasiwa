// DBK-76: read-only production cutover audit. Run with `node --env-file=.env.local`.
// Never logs credentials or provider/customer payloads. Makes SELECT queries only.
import { neon } from '@neondatabase/serverless';
import { createClient } from '@sanity/client';
import { assessDBK76, normalizeDBK76StockRow } from './dbk76_readiness_core.mjs';

const EXPECTED_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('Production DATABASE_URL is unavailable; no queries made');
const parsed = new URL(dbUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.hostname !== EXPECTED_HOST || decodeURIComponent(parsed.pathname.slice(1)) !== 'neondb') {
  throw new Error('Refusing non-pinned production Neon host/database');
}
const sql = neon(dbUrl);
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
if (projectId !== 'g34n810u' || dataset !== 'production') {
  throw new Error('Refusing unverified Sanity project or dataset');
}
const sanity = createClient({projectId,dataset,apiVersion:'2026-08-27',
  useCdn:false,perspective:'published',token:process.env.SANITY_API_WRITE_TOKEN});
try {
  // All positive balances count as legacy debt, including orders whose payment
  // status is inconsistent with their balance. This mirrors getSalesReport().
  // A narrower pending/partially-paid filter understated live liabilities.
  const legacyReceivables = await sanity.fetch(`{
    "count": count(*[_type == "commerceOrder" && coalesce(balanceDue,0)>0]),
    "amountKES": coalesce(math::sum(*[_type == "commerceOrder" && coalesce(balanceDue,0)>0].balanceDue),0),
    "pendingOrPartiallyPaidCount": count(*[_type == "commerceOrder" && coalesce(balanceDue,0)>0
      && paymentStatus in ["partially_paid","pending"]])
  }`);
  legacyReceivables.otherStatusCount = legacyReceivables.count - legacyReceivables.pendingOrPartiallyPaidCount;
  const [stockRows, freezeRows, callbackRows, mpesaRows, onlineRows,
    manualHistoryRows, mpesaHistoryRows, gateRows, configRows] = await Promise.all([
    sql`SELECT count(*)::int AS rows,coalesce(sum(on_hand),0)::text AS on_hand,
      coalesce(sum(incoming),0)::text AS incoming,
      (SELECT seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton) AS fingerprint
      FROM public.dbk51_stock_balances`,
    sql`SELECT active FROM public.dbk74_freeze_control WHERE singleton=true`,
    sql`SELECT count(*)::int AS count FROM public.dbk74_queued_callbacks WHERE reconciliation_status='PENDING'`,
    sql`SELECT count(*)::int AS count FROM public.dbk68_daraja_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED'`,
    sql`SELECT count(*)::int AS count FROM public.dbk64_online_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED'`,
    sql`SELECT count(*)::int AS count FROM public.dbk62_manual_sales`,
    sql`SELECT count(*)::int AS count FROM public.dbk68_daraja_orders`,
    sql`SELECT 'stock_engine' AS name,writes_enabled AS enabled FROM public.dbk51_stock_engine_config WHERE singleton
      UNION ALL SELECT 'settlement',enabled FROM public.dbk55_settlement_config WHERE singleton
      UNION ALL SELECT 'pos_ledger',enabled FROM public.dbk56_ledger_config WHERE singleton
      UNION ALL SELECT 'manual_pos',enabled FROM public.dbk57_manual_sale_config WHERE singleton
      UNION ALL SELECT 'real_pos',enabled FROM public.dbk62_cutover_config WHERE singleton
      UNION ALL SELECT 'finance',enabled FROM public.dbk63_financial_config WHERE singleton
      UNION ALL SELECT 'online_paystack',enabled FROM public.dbk64_online_config WHERE singleton
      UNION ALL SELECT 'online_fulfilment',enabled FROM public.dbk65_online_fulfilment_config WHERE singleton
      UNION ALL SELECT 'daraja_mpesa',enabled FROM public.dbk68_daraja_config WHERE singleton
      UNION ALL SELECT 'inventory_admin',enabled FROM public.dbk69_inventory_config WHERE singleton`,
    sql`SELECT enabled, reconciliation_fingerprint, sanity_stock_frozen, all_stock_writers_switched,
      provider_callbacks_ready, receivables_ready, refunds_ready, reports_ready
      FROM public.dbk62_cutover_config WHERE singleton`,
  ]);
  // DBK-90 logs both full stock states. Compare the current entire Neon state
  // against the logged AFTER state; a fingerprint alone is not sufficient.
  const presence = await sql`SELECT to_regclass('public.dbk90_stock_reconciliation_log') IS NOT NULL AS installed`;
  const dbk90Rows = presence[0]?.installed ? await sql`
    SELECT next_fingerprint, reconciled_at,
      after_state = (SELECT coalesce(jsonb_object_agg(
        product_id || chr(31) || variant_id || chr(31) || location_id,
        jsonb_build_object('on_hand',on_hand,'incoming',incoming,
          'product_revision',product_revision,'inventory_revision',inventory_revision,
          'seed_fingerprint',seed_fingerprint)), '{}'::jsonb)
        FROM public.dbk51_stock_balances) AS rows_match
    FROM public.dbk90_stock_reconciliation_log ORDER BY id DESC LIMIT 1`
    : [];
  const dbk90 = dbk90Rows[0] ? {
    nextFingerprint: dbk90Rows[0].next_fingerprint,
    reconciledAt: dbk90Rows[0].reconciled_at?.toISOString?.() || String(dbk90Rows[0].reconciled_at),
    rowsMatch: dbk90Rows[0].rows_match,
  } : null;
  // DBK-101 supersedes the old hardcoded DBK-71 stock baseline and DBK-90
  // only if the EXACT live balances still match the immutable replacement snapshot.
  const dbk101Exists = await sql`SELECT to_regclass('public.dbk101_stock_rebaseline_backups') IS NOT NULL AS installed`;
  const dbk101Rows = dbk101Exists[0]?.installed ? await sql`
    SELECT b.replacement_seed_fingerprint AS next_fingerprint,b.recorded_at,
      b.new_row_count = (SELECT count(*) FROM public.dbk51_stock_balances) AND
      (SELECT coalesce(jsonb_object_agg(r.product_id||chr(31)||r.variant_id||chr(31)||r.location_id,
        jsonb_build_object('on_hand',r.on_hand,'incoming',r.incoming,
          'product_revision',r.product_revision,'inventory_revision',r.inventory_revision)), '{}'::jsonb)
       FROM jsonb_to_recordset(b.replacement_balances) AS r(
         product_id text,variant_id text,location_id text,on_hand bigint,incoming bigint,
         product_revision text,inventory_revision text)) =
      (SELECT coalesce(jsonb_object_agg(s.product_id||chr(31)||s.variant_id||chr(31)||s.location_id,
        jsonb_build_object('on_hand',s.on_hand,'incoming',s.incoming,
          'product_revision',s.product_revision,'inventory_revision',s.inventory_revision)), '{}'::jsonb)
       FROM public.dbk51_stock_balances s) AS rows_match
    FROM public.dbk101_stock_rebaseline_backups b ORDER BY b.recorded_at DESC LIMIT 1`
    : [];
  const dbk101 = dbk101Rows[0] ? {
    nextFingerprint: dbk101Rows[0].next_fingerprint,
    recordedAt: dbk101Rows[0].recorded_at?.toISOString?.() || String(dbk101Rows[0].recorded_at),
    rowsMatch: dbk101Rows[0].rows_match,
  } : null;
  const state = {
    identity: 'production-neondb', freezeActive: freezeRows[0]?.active,
    dbk90, dbk101,
    stock: normalizeDBK76StockRow(stockRows[0]), legacyReceivables, pendingCallbacks: callbackRows[0]?.count,
    paidUncommittedMpesa: mpesaRows[0]?.count, paidUncommittedOnline: onlineRows[0]?.count,
    manualHistory: manualHistoryRows[0]?.count, mpesaHistory: mpesaHistoryRows[0]?.count,
    gates: gateRows.map(g=>({name:g.name,enabled:g.enabled})), dbk62: configRows[0],
    dbk107Ready: process.env.DBK107_LEGACY_FINANCE_NEON==='YES' &&
      process.env.DBK77_LEGACY_FINANCE_BRIDGE==='YES' &&
      process.env.DBK102_OPERATIONAL_NEON_ONLY==='YES' &&
      process.env.DBK62_POS_BACKEND==='neon' && configRows[0]?.receivables_ready===true &&
      (await sql`SELECT to_regprocedure('public.dbk107_record_legacy_collection(jsonb)') IS NOT NULL AS ready`)[0]?.ready===true,
  };
  console.log(JSON.stringify({observed:{freezeActive:state.freezeActive,stock:state.stock,dbk90:state.dbk90,dbk101:state.dbk101,
    legacyReceivables:state.legacyReceivables,pendingCallbacks:state.pendingCallbacks,paidUncommittedMpesa:state.paidUncommittedMpesa,
    paidUncommittedOnline:state.paidUncommittedOnline,manualHistory:state.manualHistory,
    mpesaHistory:state.mpesaHistory,activeGates:state.gates.filter(g=>g.enabled).map(g=>g.name),
    dbk62:state.dbk62},assessment:assessDBK76(state)},null,2));
} catch(err) {
  console.error('DBK-76 read-only audit unavailable:',err instanceof Error?err.message:'unknown');
  process.exitCode=1;
}
