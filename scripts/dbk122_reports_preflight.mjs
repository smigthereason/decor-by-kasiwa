/** Read-only reporting preflight. No customer/order data printed and no writes. */
import { neon } from '@neondatabase/serverless';
const flags={
  dbk62Backend:process.env.DBK62_POS_BACKEND==='neon'?'neon':'not-neon',
  approved:process.env.DBK62_CUTOVER_APPROVED==='YES',
  dbk75ReportsEnabled:process.env.DBK75_NEON_REPORT_READS==='YES',
  reportsRequested:process.env.DBK75_NEON_REPORT_READS==='YES'||process.env.DBK62_POS_BACKEND==='neon',
};
const raw=process.env.DATABASE_URL;
if(!raw)throw Error('DATABASE_URL missing');
const u=new URL(raw);
if(u.hostname!=='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech'||u.pathname!=='/neondb')throw Error('Not pinned production Neon; refusing query');
const sql=neon(raw);
const [row]=await sql`SELECT
  to_regclass('public.dbk62_manual_sales') IS NOT NULL AS manual_orders,
  to_regclass('public.dbk68_daraja_orders') IS NOT NULL AS mpesa_orders,
  to_regclass('public.dbk64_online_orders') IS NOT NULL AS online_orders,
  to_regclass('public.dbk63_pos_refunds') IS NOT NULL AS refunds,
  to_regclass('public.dbk56_pos_orders') IS NOT NULL AS pos_orders`;
const missing=Object.entries(row).filter(([,v])=>!v).map(([k])=>k);
console.log(JSON.stringify({stage:'DBK122_REPORTS_PREFLIGHT',mode:'READ_ONLY',flags,tables:row,missingTables:missing,
  likelyGuard503:flags.dbk62Backend==='neon'&&!flags.dbk75ReportsEnabled,
  followup: missing.length?'Required Neon tables are missing; do not enable reporting':
    'Inspect the 503 response code and current Vercel runtime error before enabling DBK75 or promoting code',
  changedProduction:false},null,2));
if(missing.length)process.exitCode=2;
