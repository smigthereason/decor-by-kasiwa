#!/usr/bin/env node
/** DBK-90: fresh, exact-revision stock parity check + optional frozen production stock reconciliation.
 * NEVER changes Sanity, POS records, payments, financial gates or application envs.
 * Production apply requires installed SQL function, independent write freeze, explicit operator confirmation.
 */
import {execFileSync} from 'node:child_process';
import {statSync,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {buildStockSnapshot} from './dbk51_stock_core.mjs';
import {compareRevisions} from './dbk70_cutover_core.mjs';
import {reconcileRows} from './dbk54_reconcile_core.mjs';
import {PINNED_DB_HOST,buildCandidate,normalizeRows} from './dbk90_stock_core.mjs';
import {createClient} from '@sanity/client';
import {neon} from '@neondatabase/serverless';

const [archive,...args]=process.argv.slice(2);
const apply=args.includes('--apply');
const fingerprintFlag=args.find(a=>a.startsWith('--confirm-fingerprint='));
const operatorArg=args.find(a=>a.startsWith('--operator='));
if(!archive || args.some(a=>a!=='--apply' && !a.startsWith('--confirm-fingerprint=') && !a.startsWith('--operator=')) ||
  (!apply && (fingerprintFlag || operatorArg)) ||
  (apply && (!fingerprintFlag || !operatorArg))) {
  throw Error('Usage: node --env-file=.env.local scripts/dbk90_stock_reconcile.mjs FRESH-production.tar.gz [--apply --confirm-fingerprint=<64-char-FINGERPRINT> --operator=<label>]');
}
const age=Date.now()-statSync(archive).mtimeMs;
if(age<0 || age>10*60_000) throw Error('Backup is older than 10 minutes; take a fresh Sanity export');
const uri=process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
if(uri?.hostname!==PINNED_DB_HOST || uri.pathname!=='/neondb') throw Error('Unexpected Neon database identity');
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET||'production';
if(project!=='g34n810u'||dataset!=='production') throw Error('Unexpected Sanity project/dataset');
const token=process.env.SANITY_API_READ_TOKEN||process.env.SANITY_API_WRITE_TOKEN;
if(!token) throw Error('Sanity token missing');
const sanity=createClient({projectId:project,dataset,token,apiVersion:'2026-08-27',useCdn:false,perspective:'published'});
const sql=neon(process.env.DATABASE_URL);

const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).split('\n');
const ndjsons=entries.filter(s=>s==='data.ndjson'||s.endsWith('/data.ndjson'));
if(ndjsons.length!==1) throw Error('Expected exactly one data.ndjson');
const content=execFileSync('tar',['-xOzf',archive,ndjsons[0]],{encoding:'utf8',maxBuffer:512*1024*1024});
const documents=[];
for(const line of content.split('\n')) {
  if(!line.trim())continue;
  const d=JSON.parse(line);
  if(d._type==='product'||d._type==='inventoryRecord') documents.push(d);
}
const plan=buildStockSnapshot(documents);
if(!plan.safeToSeed) throw Error('Sanity stock source invalid: '+JSON.stringify(plan.problems.slice(0,5)));
const fingerprint=plan.fingerprint;
const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
const sourceSha=hash.digest('hex');
const sanityRevisionQuery='*[_type in ["product","inventoryRecord"] && !(_id in path("drafts.**"))]{_id,_type,_rev}';
async function compareLiveRevisions() {
  const live=await sanity.fetch(sanityRevisionQuery,{},{cache:'no-store'});
  const revisions=compareRevisions(documents,live);
  if(!revisions.exactMatch) throw Error('Sanity changed since export: '+JSON.stringify(revisions));
  return revisions;
}
const revs=await compareLiveRevisions();
const [raw,config,freeze,gates,ops,cb,mpesa,online,finance,func]=await Promise.all([
  sql`SELECT product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint FROM public.dbk51_stock_balances`,
  sql`SELECT seed_fingerprint,writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`,
  sql`SELECT active FROM public.dbk74_freeze_control WHERE singleton`,
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
  sql`SELECT count(*)::int AS count FROM public.dbk51_stock_operations`,
  sql`SELECT count(*)::int AS count FROM public.dbk74_queued_callbacks WHERE reconciliation_status='PENDING'`,
  sql`SELECT count(*)::int AS count FROM public.dbk68_daraja_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED'`,
  sql`SELECT count(*)::int AS count FROM public.dbk64_online_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED'`,
  sanity.fetch(`{"count":count(*[_type=="commerceOrder" && coalesce(balanceDue,0)>0]),"amountKES":coalesce(math::sum(*[_type=="commerceOrder" && coalesce(balanceDue,0)>0].balanceDue),0)}`,{},{cache:'no-store'}),
  sql`SELECT to_regprocedure('public.dbk90_reconcile_stock(jsonb,jsonb,text,text,text)')::text AS installed`,
]);
const baseline=normalizeRows(raw);
const target=buildCandidate(plan.rows,fingerprint);
const diff=reconcileRows(plan.rows,baseline,15);
const problems=[];
if(config.length!==1 || !/^[a-f0-9]{64}$/.test(config[0]?.seed_fingerprint||'')) problems.push('Invalid/missing existing Neon stock fingerprint');
if(config[0]?.writes_enabled!==false) problems.push('Neon stock writes enabled');
if(gates.length!==10 || gates.some(x=>x.enabled!==false)) problems.push('Neon write gates not all disabled');
if(ops[0]?.count!==0) problems.push('Neon stock operations table is not empty');
if(cb[0]?.count!==0 || mpesa[0]?.count!==0 || online[0]?.count!==0) problems.push('Pending provider callbacks or paid-stock exceptions');
if(apply && freeze[0]?.active!==true) problems.push('Production maintenance freeze not active');
if(apply && func[0]?.installed==null) problems.push('DBK90 SQL reconciliation function not installed');
const report={stage:'DBK-90',mode:apply?'WRITE_REQUESTED':'READ_ONLY',sourceBackup:basename(archive),sourceSha256:sourceSha,
  sourceFingerprint:fingerprint,source:{productCount:plan.productCount,inventoryRecords:plan.inventoryRecordCount,
    balanceRows:plan.balanceCount,onHand:plan.quantityTotals.onHand,incoming:plan.quantityTotals.incoming,
    quarantinedUnits:plan.quantityClassification.quarantinedOnHand},
  neon:{rows:baseline.length,onHand:baseline.reduce((s,r)=>s+r.on_hand,0),incoming:baseline.reduce((s,r)=>s+r.incoming,0),
    existingFingerprint:config[0]?.seed_fingerprint,stockOperations:ops[0]?.count},
  parity:{matched:diff.inSync,changeCount:diff.changeCount,addedInSanity:diff.addedInSanity,
    missingInSanity:diff.missingInSanity,stockDelta:diff.stockDifference,incomingDelta:diff.incomingDifference,
    topChanges:diff.topChanges},
  guards:{sourceRevisionsMatch:revs.exactMatch,freezeActive:freeze[0]?.active,allGatesOff:gates.length===10&&gates.every(x=>x.enabled===false),
    pendingCallbacks:cb[0]?.count,paidUncommittedMpesa:mpesa[0]?.count,paidUncommittedOnline:online[0]?.count,
    legacyReceivables:finance?.count,legacyReceivableKES:finance?.amountKES,sqlFunctionInstalled:Boolean(func[0]?.installed)},
  blockers:problems,notes:['Stock reconciliation does not migrate POS, payments, orders, refunds or Sanity assets.',
    'Do not activate Neon transaction gates while legacy receivables and financial workflows remain unresolved.']};
console.log(JSON.stringify(report,null,2));
if(!apply)process.exit(0);
if(problems.length)throw Error('DBK90 apply blocked: '+problems.join('; '));
if(diff.inSync)throw Error('Already in sync: no stock change necessary');
if(process.env.DBK90_STOCK_RECONCILE!=='YES'||process.env.DBK90_ALL_SANITY_WRITERS_FROZEN!=='YES'||
  process.env.DBK90_INDEPENDENT_BACKUP_CONFIRMED!=='YES') throw Error('Explicit production freeze/backup confirmations missing');
if(fingerprintFlag.split('=')[1]!==fingerprint) throw Error('Approval fingerprint not equal to current source');
const operator=operatorArg.slice('--operator='.length);
if(!/^[A-Za-z0-9._-]{3,70}$/.test(operator)) throw Error('Operator label invalid');
await compareLiveRevisions();
const beforeObject=Object.fromEntries(baseline.map(r=>[
  [r.product_id,r.variant_id,r.location_id].join('\x1f'),
  {on_hand:r.on_hand,incoming:r.incoming,product_revision:r.product_revision,inventory_revision:r.inventory_revision,seed_fingerprint:r.seed_fingerprint},
]));
// Single PostgreSQL transaction in a preinstalled, fail-closed function. No client-side row-by-row writes.
const result=await sql`SELECT public.dbk90_reconcile_stock(
 ${JSON.stringify(beforeObject)}::jsonb,${JSON.stringify(target)}::jsonb,
 ${config[0].seed_fingerprint},${fingerprint},${operator}) AS result`;
console.log(JSON.stringify({stage:'DBK-90',mode:'NEON_STOCK_RECONCILED',result:result[0]?.result,
  warning:'Neon transaction gates remain disabled; no live authority switch.'},null,2));
const [now,afterConfig]=await Promise.all([
 sql`SELECT product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint FROM public.dbk51_stock_balances`,
 sql`SELECT seed_fingerprint,writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`,
]);
const post=reconcileRows(target,now);
if(!post.inSync || now.length!==plan.balanceCount || afterConfig[0]?.seed_fingerprint!==fingerprint || afterConfig[0]?.writes_enabled!==false) {
  throw Error('Post-write Neon stock verification failed; keep all gates disabled and investigate');
}
await compareLiveRevisions();
console.log(JSON.stringify({stage:'DBK-90',mode:'NEON_STOCK_VERIFIED',rows:now.length,
  onHand:now.reduce((s,r)=>s+Number(r.on_hand),0),incoming:now.reduce((s,r)=>s+Number(r.incoming),0),
  fingerprint,writesEnabled:false,cutoverApproved:false},null,2));
