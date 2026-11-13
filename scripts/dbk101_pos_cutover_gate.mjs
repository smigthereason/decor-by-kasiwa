#!/usr/bin/env node
/**
 * DBK-101: read-only FINANCIAL go-live assessment. This does not run sales,
 * send STK pushes, alter Neon flags, or deploy Vercel changes.
 * Run: node --env-file=.env.local scripts/dbk101_pos_cutover_gate.mjs
 */
const REQUIRED_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const raw=process.env.DATABASE_URL;
if(!raw) throw new Error('DATABASE_URL is absent; cannot assess production cutover');
const url=new URL(raw);
if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==REQUIRED_HOST||url.pathname!=='/neondb') {
  throw new Error('Refusing unpinned or non-production Neon database');
}
const {neon}=await import('@neondatabase/serverless');
const sql=neon(raw);
const mustHave=[
  'dbk51_stock_engine_config','dbk51_stock_balances','dbk55_settlement_config',
  'dbk56_ledger_config','dbk56_pos_orders','dbk56_pos_payments',
  'dbk57_manual_sale_config','dbk62_cutover_config','dbk62_manual_sales',
  'dbk68_daraja_config','dbk68_daraja_orders','dbk69_inventory_config',
];
const present=await sql`SELECT name,to_regclass('public.' || name) IS NOT NULL AS found
  FROM unnest(${mustHave}::text[]) AS name`;
const missing=present.filter(row=>!row.found).map(row=>row.name);
if(missing.length){
  console.log(JSON.stringify({stage:'DBK-101',ready:false,missing,actions:['Install/verify missing migration schema. No financial cutover has occurred.']},null,2));
  process.exitCode=2;
}else{
  const [c]=await sql`SELECT c.enabled,c.sanity_stock_frozen,c.all_stock_writers_switched,
      c.provider_callbacks_ready,c.receivables_ready,c.refunds_ready,c.reports_ready,
      c.reconciliation_fingerprint,
      s.writes_enabled AS stock_writes_enabled,s.seed_fingerprint,
      d.enabled AS daraja_enabled,p.enabled AS settlement_enabled,
      l.enabled AS ledger_enabled,m.enabled AS manual_enabled,
      i.enabled AS inventory_admin_enabled
    FROM public.dbk62_cutover_config c
    JOIN public.dbk51_stock_engine_config s USING(singleton)
    JOIN public.dbk68_daraja_config d USING(singleton)
    JOIN public.dbk55_settlement_config p USING(singleton)
    JOIN public.dbk56_ledger_config l USING(singleton)
    JOIN public.dbk57_manual_sale_config m USING(singleton)
    JOIN public.dbk69_inventory_config i USING(singleton)
    WHERE c.singleton`;
  if(!c){console.log(JSON.stringify({stage:'DBK-101',ready:false,blockers:['Required singleton configuration row missing']},null,2));process.exitCode=2;}
  else{
    const tests={
      manual_cutover_enabled:c.enabled===true,
      stock_writes_enabled:c.stock_writes_enabled===true,
      stock_seed_reconciled:typeof c.seed_fingerprint==='string'&&c.seed_fingerprint.length>=32&&c.seed_fingerprint===c.reconciliation_fingerprint,
      sanity_stock_frozen:c.sanity_stock_frozen===true,
      all_stock_writers_switched:c.all_stock_writers_switched===true,
      provider_callbacks_ready:c.provider_callbacks_ready===true,
      receivables_ready:c.receivables_ready===true,
      refunds_ready:c.refunds_ready===true,
      reports_ready:c.reports_ready===true,
      daraja_enabled:c.daraja_enabled===true,
      settlement_enabled:c.settlement_enabled===true,
      ledger_enabled:c.ledger_enabled===true,
      manual_enabled:c.manual_enabled===true,
      inventory_admin_enabled:c.inventory_admin_enabled===true,
    };
    const blockers=Object.entries(tests).filter(([,v])=>!v).map(([k])=>k);
    const ready=blockers.length===0;
    console.log(JSON.stringify({stage:'DBK-101',mode:'READ_ONLY_PRODUCTION_CUTOVER_ASSESSMENT',
      ready,tests,blockers,
      note:'Database flags are prerequisites, not proof of current Sanity/Neon stock parity or provider callback reachability. Verify those outside this report.',
      productionVercelVariables:ready?{
        DBK101_POS_NEON_REQUIRED:'YES',DBK62_POS_BACKEND:'neon',
        DBK62_CUTOVER_APPROVED:'YES',DBK62_NEON_READS:'YES',
        DBK68_MPESA_BACKEND:'neon',DBK68_CUTOVER_APPROVED:'YES',
        DBK68_MPESA_READS:'YES',DBK68_MPESA_SETTLEMENT:'YES',
        DBK_INVENTORY_BACKEND:'neon',DBK69_INVENTORY_ADMIN:'enabled',
        DBK69_EXPECTED_NEON_HOST:REQUIRED_HOST,
        DBK75_NEON_REPORT_READS:'YES',
      }:null,
    },null,2));
    if(!ready)process.exitCode=2;
  }
}
