// DBK-120 add-only SQL function installer. Does not insert/update stock data.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {neon} from '@neondatabase/serverless';
const mode=process.argv[2];
if (!['--plan','--apply'].includes(mode)) throw Error('Usage: --plan|--apply');
const raw=process.env.DATABASE_URL;
if (!raw) throw Error('DATABASE_URL missing');
const u=new URL(raw);
const HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
if (!['postgres:','postgresql:'].includes(u.protocol) || u.hostname!==HOST ||
    decodeURIComponent(u.pathname)!=='/neondb') throw Error('Refusing unexpected database');
const sql=neon(raw);
const SIGNATURE='public.dbk120_register_catalogue_variants(text,jsonb)';
const inspect=async()=>{
  const [r]=await sql`SELECT
    to_regprocedure(${SIGNATURE}) IS NOT NULL AS installed,
    (SELECT active FROM public.dbk74_freeze_control WHERE singleton) AS frozen,
    (SELECT enabled FROM public.dbk69_inventory_config WHERE singleton) AS inventory,
    (SELECT writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton) AS writes,
    (SELECT count(*) FROM public.dbk51_stock_balances) AS rows,
    (SELECT count(*) FROM public.dbk51_stock_operations) AS operations`;
  return r;
};
const before=await inspect();
if(!before?.inventory || !before?.writes || before.frozen) throw Error('Production stock authority is not active and unfrozen');
console.log(JSON.stringify({stage:'DBK120_ZERO_STOCK_REGISTRATION',mode,readiness:before,transactionRowsChanged:false}));
if(mode==='--plan') process.exit(0);
if(before.installed) {
  const [f]=await sql`SELECT pg_get_functiondef(to_regprocedure(${SIGNATURE})) AS body`;
  if(!f?.body?.includes('DBK-120') || !f?.body?.includes('dbk51:')) throw Error('Existing function differs from reviewed DBK120. Refusing overwrite.');
} else {
  const source=await readFile(fileURLToPath(new URL('../migration/dbk120-variant-catalogue-register.sql',import.meta.url)),'utf8');
  const marker='\nREVOKE ALL ON FUNCTION public.dbk120_register_catalogue_variants';
  const idx=source.lastIndexOf(marker);
  if (idx<0) throw Error('Missing DBK120 function privileges declaration');
  await sql.query(source.slice(0,idx));
}
// Run privilege hardening even after a partial/ambiguous prior install.
await sql.query('REVOKE ALL ON FUNCTION public.dbk120_register_catalogue_variants(text,jsonb) FROM PUBLIC');
const after=await inspect();
if(!after.installed || after.frozen!==before.frozen ||
   after.inventory!==before.inventory || after.writes!==before.writes)
  throw Error('Unexpected DBK120 installer postcondition: inspect before continuing');
console.log(JSON.stringify({stage:'DBK120_FUNCTION_INSTALLED',
  inventoryRowsBefore:before.rows,inventoryRowsAfter:after.rows,
  inventoryOperationsBefore:before.operations,inventoryOperationsAfter:after.operations,
  note:'No data mutations issued by installer; concurrent live inventory activity may change counts',
  gatesUnchanged:true,paymentInitiated:false}));
