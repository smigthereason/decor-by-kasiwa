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
  const state = {
    identity: 'production-neondb', freezeActive: freezeRows[0]?.active,
    stock: normalizeDBK76StockRow(stockRows[0]), legacyReceivables, pendingCallbacks: callbackRows[0]?.count,
    paidUncommittedMpesa: mpesaRows[0]?.count, paidUncommittedOnline: onlineRows[0]?.count,
    manualHistory: manualHistoryRows[0]?.count, mpesaHistory: mpesaHistoryRows[0]?.count,
    gates: gateRows.map(g=>({name:g.name,enabled:g.enabled})), dbk62: configRows[0],
  };
  console.log(JSON.stringify({observed:{freezeActive:state.freezeActive,stock:state.stock,
    legacyReceivables:state.legacyReceivables,pendingCallbacks:state.pendingCallbacks,paidUncommittedMpesa:state.paidUncommittedMpesa,
    paidUncommittedOnline:state.paidUncommittedOnline,manualHistory:state.manualHistory,
    mpesaHistory:state.mpesaHistory,activeGates:state.gates.filter(g=>g.enabled).map(g=>g.name),
    dbk62:state.dbk62},assessment:assessDBK76(state)},null,2));
} catch(err) {
  console.error('DBK-76 read-only audit unavailable:',err instanceof Error?err.message:'unknown');
  process.exitCode=1;
}
