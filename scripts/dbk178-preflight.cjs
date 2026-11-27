// Read-only. Use Node 22+ with the existing production environment loaded.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {neon}=require('@neondatabase/serverless');
const root=path.resolve(__dirname,'..');const cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});new Function('require','module','exports',out.outputText)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);return m.exports;}
async function main(){
 const u=new URL(process.env.DATABASE_URL||'');
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech'||u.pathname!=='/neondb')throw Error('PINNED_PRODUCTION_DATABASE_REQUIRED');
 const sql=neon(u.toString());
 const {knowledgeSections,validKnowledge}=load(path.join(root,'lib/whatsapp/dbk155-sales-core.ts'));
 const {counties}=load(path.join(root,'lib/whatsapp/dbk165-checkout-intent.ts'));
 const {countyDeliveryFee,deliveryTiming}=load(path.join(root,'lib/whatsapp/dbk178-policy.ts'));
 const [kb]=await sql`SELECT version,content FROM public.dbk155_knowledge_versions ORDER BY version DESC LIMIT 1`;
 const valid=validKnowledge(kb?.content);
 console.log('=== PUBLISHED KNOWLEDGE (NO RAW SECTION TEXT) ===');
 console.log({version:kb?.version??null,valid,sections:knowledgeSections.map(k=>({section:k,length:typeof kb?.content?.[k]==='string'?kb.content[k].length:null,nonEmpty:typeof kb?.content?.[k]==='string'&&!!kb.content[k].trim()}))});
 const rates=counties.map(county=>({county,fee:valid?countyDeliveryFee(kb.content.delivery,county):null}));
 console.table(rates);console.log({validCountyRates:rates.filter(x=>x.fee!==null).length,timingRecognized:valid&&!!deliveryTiming(kb.content.delivery)});
 console.log('=== LIVE PAYMENT SCHEMA ===');
 console.table(await sql`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='dbk36_wa_prod_payment_orders' ORDER BY ordinal_position`);
 console.table(await sql`SELECT conrelid::regclass::text AS table_name,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('public.dbk36_wa_prod_payment_orders'::regclass,'public.dbk36_wa_paid_intake'::regclass) ORDER BY 1,2`);
 console.table(await sql`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='dbk36_wa_prod_payment_orders' ORDER BY indexname`);
 console.log('=== EXISTING PAYMENT STATES (COUNTS ONLY) ===');
 console.table(await sql`SELECT status,count(*)::int AS count FROM public.dbk36_wa_prod_payment_orders GROUP BY status ORDER BY status`);
 const funcs=await sql`SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('dbk36_wa_prod_finalize_paid','dbk36_wa_stock_claim','dbk36_wa_stock_finish','dbk103_commit_verified_wa_stock','dbk136_sync_verified_whatsapp') ORDER BY signature`;
 console.log('=== LIVE FUNCTION DEFINITIONS (REVIEW BEFORE SHARING) ===');
 for(const f of funcs){console.log(f.signature);console.log(f.definition);}
 console.log('READ_ONLY_PREFLIGHT_COMPLETE');
}
main().catch(e=>{console.error('DBK178_PREFLIGHT_FAILED',String(e?.code||e?.name||'UNKNOWN'));process.exitCode=1;});
