#!/usr/bin/env node
/**
 * DBK-101/102/103 combined production release audit. READ-ONLY.
 * Reports actual blockers rather than inferring production activation from build success.
 * Usage: node --env-file=.env --env-file=.env.local scripts/dbk101_103_final_release.mjs
 * An audit never sends an STK push, changes stock, flips flags, or marks payments paid.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildStockSnapshot } from './dbk51_stock_core.mjs';
import { reconcileRows } from './dbk54_reconcile_core.mjs';

const EXPECTED_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const PROJECT='g34n810u';
const dbURL=process.env.DATABASE_URL;
if (!dbURL) throw Error('DATABASE_URL missing: no production checks performed');
const u=new URL(dbURL);
if (!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==EXPECTED_HOST||u.pathname!=='/neondb')
  throw Error('Refusing unexpected Neon production database');
if ((process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID)!==PROJECT ||
    (process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET||'production')!=='production')
  throw Error('Refusing unexpected Sanity production project/dataset');
if (process.argv.length!==2) throw Error('No mutation modes supported. This is a read-only audit.');
const {neon}=await import('@neondatabase/serverless');
const {createClient}=await import('@sanity/client');
const sql=neon(dbURL);
const token=process.env.SANITY_API_READ_TOKEN || process.env.SANITY_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN;
if (!token) throw Error('Sanity read token unavailable');
const sanity=createClient({projectId:PROJECT,dataset:'production',apiVersion:'2026-08-27',useCdn:false,
  perspective:'published',token});
const check=(name,ok,detail)=>({name,ok:Boolean(ok),detail});
const checks=[];
const add=(name,ok,detail)=>checks.push(check(name,ok,detail));
const [source,finance,config,states,backup,balances,installed]=await Promise.all([
  sanity.fetch(`*[_type in ['product','inventoryRecord'] && !(_id in path('drafts.**'))]`,{}, {cache:'no-store'}),
  sanity.fetch(`{
    "receivableCount": count(*[_type == "commerceOrder" && coalesce(balanceDue,0)>0]),
    "receivableAmountKES": coalesce(math::sum(*[_type == "commerceOrder" && coalesce(balanceDue,0)>0].balanceDue),0)
  }`,{},{cache:'no-store'}),
  sql`SELECT c.enabled,c.sanity_stock_frozen,c.all_stock_writers_switched,c.provider_callbacks_ready,
     c.receivables_ready,c.refunds_ready,c.reports_ready,c.reconciliation_fingerprint,
     s.seed_fingerprint,s.writes_enabled,
     (SELECT active FROM public.dbk74_freeze_control WHERE singleton) AS freeze_active,
     (SELECT enabled FROM public.dbk55_settlement_config WHERE singleton) AS settlement_enabled,
     (SELECT enabled FROM public.dbk56_ledger_config WHERE singleton) AS ledger_enabled,
     (SELECT enabled FROM public.dbk57_manual_sale_config WHERE singleton) AS manual_enabled,
     (SELECT enabled FROM public.dbk63_financial_config WHERE singleton) AS finance_enabled,
     (SELECT enabled FROM public.dbk64_online_config WHERE singleton) AS online_enabled,
     (SELECT enabled FROM public.dbk65_online_fulfilment_config WHERE singleton) AS online_fulfillment_enabled,
     (SELECT enabled FROM public.dbk68_daraja_config WHERE singleton) AS daraja_enabled,
     (SELECT enabled FROM public.dbk69_inventory_config WHERE singleton) AS inventory_enabled
     FROM public.dbk62_cutover_config c JOIN public.dbk51_stock_engine_config s USING(singleton)
     WHERE c.singleton`,
  sql`SELECT
    (SELECT count(*)::int FROM public.dbk74_queued_callbacks WHERE reconciliation_status='PENDING') AS queued_callbacks,
    (SELECT count(*)::int FROM public.dbk68_daraja_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED') AS paid_mpesa_stock_exceptions,
    (SELECT count(*)::int FROM public.dbk64_online_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED') AS paid_online_stock_exceptions,
    (SELECT count(*)::int FROM public.dbk68_daraja_orders WHERE payment_status IN ('STARTING','PENDING')) AS pending_mpesa,
    (SELECT count(*)::int FROM public.dbk56_pos_orders) AS neon_pos_orders,
    (SELECT count(*)::int FROM public.dbk62_manual_sales) AS neon_manual_sales,
    (SELECT count(*)::int FROM public.dbk51_stock_operations) AS stock_operations`,
  sql`SELECT rebaseline_id,recorded_at,source_revision_fingerprint,replacement_seed_fingerprint,
    new_row_count FROM public.dbk101_stock_rebaseline_backups ORDER BY recorded_at DESC LIMIT 1`,
  sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id`,
  sql`SELECT to_regprocedure('public.dbk103_commit_verified_wa_stock(text,text)') IS NOT NULL AS dbk103_function_installed`,
]);
if (!Array.isArray(source)||source.length<1||source.length>10000) throw Error('Sanity stock fetch invalid');
const snapshot=buildStockSnapshot(source);
const sourceRevision=createHash('sha256').update(JSON.stringify(source.map(d=>[d._id,d._rev])
  .sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
const diff=reconcileRows(snapshot.rows,balances,10);
const c=config[0],q=states[0],b=backup[0];
if(!c||!q) throw Error('Neon production config missing');
add('DBK-101 live Sanity/Neon quantity parity',snapshot.safeToSeed&&diff.inSync,
  `Sanity=${snapshot.rows.length}; Neon=${balances.length}; differences=${diff.changeCount}`);
add('DBK-101 reconciled stock fingerprint',Boolean(b&&snapshot.fingerprint===b.replacement_seed_fingerprint&&
  c.seed_fingerprint===b.replacement_seed_fingerprint&&c.reconciliation_fingerprint===b.replacement_seed_fingerprint),
  `Backup=${b?.rebaseline_id||'missing'}`);
add('DBK-101 Sanity revisions unchanged since rebaseline',Boolean(b&&sourceRevision===b.source_revision_fingerprint),
  `Sanity documents=${source.length}`);
add('Storefront and POS write freeze in effect',c.freeze_active===true,'DBK-74 freeze must be active during cutover');
add('All callback deliveries reconciled',Number(q.queued_callbacks)===0,`Pending=${q.queued_callbacks}`);
add('No paid M-Pesa/Paystack stock exceptions',Number(q.paid_mpesa_stock_exceptions)===0&&
  Number(q.paid_online_stock_exceptions)===0,
  `M-Pesa=${q.paid_mpesa_stock_exceptions}; Paystack=${q.paid_online_stock_exceptions}`);
add('No pending M-Pesa STK operations',Number(q.pending_mpesa)===0,`Pending=${q.pending_mpesa}`);
add('Legacy Sanity receivables safely resolved',Number(finance.receivableCount)===0 &&
  Number(finance.receivableAmountKES)===0,
  `Outstanding orders=${finance.receivableCount}; amountKES=${finance.receivableAmountKES}`);
add('Provider callback route independently approved',c.provider_callbacks_ready===true,'Requires callback routing and reconciliation proof');
add('All stock writers switched',c.all_stock_writers_switched===true,'Includes POS, Paystack, admin, refunds, external integrations');
add('Legacy finance/reporting ready',c.receivables_ready===true&&c.refunds_ready===true&&c.reports_ready===true,
  `receivables=${c.receivables_ready}; refunds=${c.refunds_ready}; reports=${c.reports_ready}`);
add('Sanity stock frozen and signed off',c.sanity_stock_frozen===true,'DBK-62 sign-off is distinct from DBK-74 HTTP freeze');
add('DBK-103 verified-WhatsApp Neon fulfillment function',installed[0]?.dbk103_function_installed===true,'Installed function only; real channel still unavailable');
const databaseGates={stock:c.writes_enabled,pos:c.enabled,settlement:c.settlement_enabled,
  ledger:c.ledger_enabled,manual:c.manual_enabled,finance:c.finance_enabled,
  online:c.online_enabled,onlineFulfillment:c.online_fulfillment_enabled,
  daraja:c.daraja_enabled,inventory:c.inventory_enabled};
const databaseActive=Object.values(databaseGates).every(v=>v===true);
const webEnv={DBK101_POS_NEON_REQUIRED:process.env.DBK101_POS_NEON_REQUIRED==='YES',
  DBK102_OPERATIONAL_NEON_ONLY:process.env.DBK102_OPERATIONAL_NEON_ONLY==='YES',
  DBK62_POS_BACKEND:process.env.DBK62_POS_BACKEND==='neon',
  DBK62_CUTOVER_APPROVED:process.env.DBK62_CUTOVER_APPROVED==='YES',
  DBK68_MPESA_BACKEND:process.env.DBK68_MPESA_BACKEND==='neon',
  DBK68_CUTOVER_APPROVED:process.env.DBK68_CUTOVER_APPROVED==='YES',
  DBK_INVENTORY_BACKEND:process.env.DBK_INVENTORY_BACKEND==='neon',
  DBK103_WA_NEON_STOCK_ENABLED:process.env.DBK103_WA_NEON_STOCK_ENABLED==='YES'};
const blockers=checks.filter(x=>!x.ok);
const result={stage:'DBK-101/102/103',mode:'READ_ONLY_RELEASE_AUDIT',
  releaseStatus:blockers.length||!databaseActive?'HOLD':'DB_FLAGS_READY_RUNTIME_UNVERIFIED',
  technicalChecksPassed:checks.length-blockers.length,technicalChecksTotal:checks.length,
  cutoverBlockers:blockers,
  stock:{sourceRows:diff.sourceRows,neonRows:diff.targetRows,differenceCount:diff.changeCount,
    addedInSanity:diff.addedInSanity,missingInSanity:diff.missingInSanity,changedRows:diff.changedRows,
    snapshotMatches:diff.inSync,backupId:b?.rebaseline_id||null},
  financial:{legacyReceivableCount:finance.receivableCount,legacyReceivableAmountKES:finance.receivableAmountKES,
    pendingMpesa:q.pending_mpesa,pendingQueuedCallbacks:q.queued_callbacks,
    paidMpesaExceptions:q.paid_mpesa_stock_exceptions,paidOnlineExceptions:q.paid_online_stock_exceptions},
  databaseGates,localEnvironmentSwitches:webEnv,
  productionVercelEnvironmentVerified:false,
  realPaymentAndProviderCallbacksVerified:false,
  sourceCommit:'Run against current main. This report does not inspect remote Vercel deployment identity.',
  note:'NO writes or real STK calls were made. This is not authorization to flip flags, redirect live sales, or claim production payments work.'};
const destination=join(homedir(),'Downloads','DBK101-102-103-release-readiness.json');
await writeFile(destination,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:result.releaseStatus,stock:result.stock,
  cutoverBlockers:result.cutoverBlockers,databaseGates:result.databaseGates,
  releaseReport:destination,doesNotChangeProduction:true},null,2));
if(result.releaseStatus==='HOLD') process.exitCode=2;
