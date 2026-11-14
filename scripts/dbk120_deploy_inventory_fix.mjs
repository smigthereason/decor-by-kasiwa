#!/usr/bin/env node
/**
 * DBK-120: guarded variants and inventory API fix. Does not change stock, finance, callbacks, DB gates,
 * or the DBK-74 freeze. Mirrors DBK-115 deployment-level routing flags so this
 * release cannot inadvertently replace Neon with the legacy Sanity backend.
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const FLAGS = {
  DBK101_POS_NEON_REQUIRED:'YES',DBK102_OPERATIONAL_NEON_ONLY:'YES',
  DBK62_POS_BACKEND:'neon',DBK62_CUTOVER_APPROVED:'YES',DBK62_NEON_READS:'YES',
  DBK64_ONLINE_BACKEND:'neon',DBK64_CUTOVER_APPROVED:'YES',
  DBK64_ONLINE_SETTLEMENT:'YES',DBK64_ONLINE_READS:'YES',
  DBK68_MPESA_BACKEND:'neon',DBK68_CUTOVER_APPROVED:'YES',
  DBK68_MPESA_SETTLEMENT:'YES',DBK68_MPESA_READS:'YES',
  DBK_INVENTORY_BACKEND:'neon',DBK69_INVENTORY_ADMIN:'enabled',
  DBK69_EXPECTED_NEON_HOST:HOST,
  DBK77_LEGACY_FINANCE_BRIDGE:'YES',DBK107_LEGACY_FINANCE_NEON:'YES',
  DBK108_LEGACY_REFUNDS_NEON:'YES',
};
const say=(stage,details={})=>console.log(JSON.stringify({stage,...details}));
function run(command,args,timeout=300000){
  const r=spawnSync(command,args,{cwd:root,encoding:'utf8',timeout,maxBuffer:20*1024*1024});
  if (r.error || r.status!==0) {
    throw Error(`${command} ${args.slice(0,3).join(' ')} failed: ${String(r.stderr || r.stdout || r.error).slice(-1200)}`);
  }
  return r.stdout.trim();
}
const mode=process.argv[2];
if (!['--plan','--deploy'].includes(mode) || process.argv.length!==3)
  throw Error('Usage: --plan OR --deploy');
const metadata=JSON.parse(readFileSync(resolve(root,'.vercel/project.json'),'utf8'));
if(metadata.projectName!=='decor-by-kasiwa'||!metadata.orgId)
  throw Error('Vercel CLI linked project does not match decor-by-kasiwa');
const productApi=readFileSync(resolve(root,'app/api/backoffice/products/[id]/route.ts'),'utf8');
const inventoryApi=readFileSync(resolve(root,'app/api/backoffice/inventory/movements/route.ts'),'utf8');
const mapper=readFileSync(resolve(root,'lib/db/dbk69-inventory-core.ts'),'utf8');
if(!productApi.includes('dbk120RegisterCatalogueVariants') ||
   !productApi.includes('dbk120ValidateVariantReadiness') ||
   !inventoryApi.includes('dbk120InventoryFailure') ||
   !mapper.includes('unmatched.some')) throw Error('DBK120 source changes are missing; refusing release');
const raw=process.env.DATABASE_URL;
if(!raw)throw Error('Missing production Neon DATABASE_URL');
const db=new URL(raw);
if (!['postgres:','postgresql:'].includes(db.protocol)||db.hostname!==HOST||db.pathname!=='/neondb')
  throw Error('Unexpected database identity; refusing to deploy');
const site='https://www.decorbykasiwa.co.ke';
const callback=site+'/api/payments/mobile/callback';
const sql=neon(raw);
const [gate]=await sql`SELECT to_regprocedure('public.dbk120_register_catalogue_variants(text,jsonb)') IS NOT NULL AS installed,
  (SELECT active FROM public.dbk74_freeze_control WHERE singleton) AS frozen,
  (SELECT writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton) AS stock_writes,
  (SELECT count(*) FROM public.dbk51_stock_balances) AS stock_rows`;
if(!gate.installed || gate.frozen || !gate.stock_writes) throw Error('DBK120 SQL registration not installed or Neon stock unavailable');
say('DBK120_INVENTORY_PLAN',{mode,databaseWrites:false,gatewayChanges:false,
  stockChanges:false,neonFlagsPreserved:true,site,mpesaCallback:callback,
  stockRows:gate.stock_rows,variantFunctionInstalled:gate.installed});
if(mode==='--plan')process.exit(0);

// No risk to the live deployment until promotion. Build locally first.
run('npm',['run','build'],240000);
say('LOCAL_BUILD_PASSED');
const token=randomBytes(32).toString('hex');
const args=['deploy','--prod','--skip-domain','--yes'];
for(const [name,value] of Object.entries(FLAGS))args.push('--env',`${name}=${value}`);
args.push('--build-env',`NEXT_PUBLIC_SITE_URL=${site}`);
args.push('--env',`NEXT_PUBLIC_SITE_URL=${site}`);
args.push('--env',`MPESA_CALLBACK_URL=${callback}`);
args.push('--env','MPESA_ENV=production');
args.push('--env',`DBK112_PROBE_TOKEN=${token}`);
const output=run('vercel',args,300000);
const url=output.split(/\s+/).map(s=>s.trim()).find(s=>/^https:\/\/[^\s]+\.vercel\.app\/?$/.test(s));
if (!url)throw Error('Staged deployment URL missing; did not promote');
say('STAGED_INVENTORY_DEPLOYMENT',{url,promoted:false});

function verify(label){
  const response=run('vercel',['curl','/api/dbk112-release-check','--deployment',url,
    '-H',`X-DBK112-Probe: ${token}`],90000);
  let data;try{data=JSON.parse(response)}catch{throw Error('Production runtime probe returned invalid JSON')}
  if(data.status!=='DBK115_LIVE_OPEN'||data.allFlagsMatch!==true||
     data.databaseIdentityValid!==true||data.stockGatesOn!==true||
     data.maintenanceFrozen!==false||data.mpesaReady!==true||
     data.livePaystack!==true||data.financeSchemaReady!==true){
    throw Error(`${label}: Neon payment readiness check failed: ${JSON.stringify(data)}`);
  }
  say(label,{status:data.status,stockRows:data.stockRows,stockGatesOn:data.stockGatesOn,maintenanceFrozen:data.maintenanceFrozen});
}
verify('STAGED_NEON_RUNTIME_VERIFIED');
run('vercel',['promote',url,'--yes'],180000);
say('INVENTORY_DEPLOYMENT_PROMOTED',{url});
verify('PROMOTED_NEON_RUNTIME_VERIFIED');
say('DBK120_INVENTORY_PATCH_LIVE',{url,
  variants:'zero-stock registration enabled; no existing stock altered',
  inventory:'action-specific responses; live purchase/receipt validation still required',
  paymentGatesChanged:false,databaseStockRowsChangedByDeployment:false,
  next:'Test an authorized zero-stock variant edit, then an actual purchase and receipt with original operation id retained.'});
