// DBK-114: token-protected, read-only stage/production verification.
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const EXPECTED_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const FLAGS={"DBK101_POS_NEON_REQUIRED":"YES","DBK102_OPERATIONAL_NEON_ONLY":"YES","DBK62_POS_BACKEND":"neon","DBK62_CUTOVER_APPROVED":"YES","DBK62_NEON_READS":"YES","DBK64_ONLINE_BACKEND":"neon","DBK64_CUTOVER_APPROVED":"YES","DBK64_ONLINE_SETTLEMENT":"YES","DBK64_ONLINE_READS":"YES","DBK68_MPESA_BACKEND":"neon","DBK68_CUTOVER_APPROVED":"YES","DBK68_MPESA_SETTLEMENT":"YES","DBK68_MPESA_READS":"YES","DBK_INVENTORY_BACKEND":"neon","DBK69_INVENTORY_ADMIN":"enabled","DBK69_EXPECTED_NEON_HOST":"ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech","DBK77_LEGACY_FINANCE_BRIDGE":"YES","DBK107_LEGACY_FINANCE_NEON":"YES","DBK108_LEGACY_REFUNDS_NEON":"YES"} as Record<string,string>;
const deny=()=>NextResponse.json({message:'Not found'},{status:404,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){
 const expected=process.env.DBK112_PROBE_TOKEN||'';
 const provided=req.headers.get('x-dbk112-probe')||'';
 if(!/^[a-f0-9]{64}$/.test(expected)||provided.length!==expected.length||
   !timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return deny();
 const env=process.env;
 let dbOk=false, rows=0,off=false,on=false,frozen=false,finance=false;
 try{
   const url=new URL(env.DATABASE_URL||'https://invalid.invalid');
   dbOk=['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===EXPECTED_HOST&&url.pathname==='/neondb';
   if(dbOk){
     const sql=neon(env.DATABASE_URL!);
     const [r]=await sql`SELECT
       (SELECT count(*)::int FROM public.dbk51_stock_balances) AS rows,
       (SELECT enabled FROM public.dbk62_cutover_config WHERE singleton) AS pos,
       (SELECT writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton) AS stock,
       (SELECT active FROM public.dbk74_freeze_control WHERE singleton) AS frozen,
       (SELECT enabled FROM public.dbk55_settlement_config WHERE singleton) AS settlement,
       (SELECT enabled FROM public.dbk56_ledger_config WHERE singleton) AS ledger,
       (SELECT enabled FROM public.dbk57_manual_sale_config WHERE singleton) AS manual,
       (SELECT enabled FROM public.dbk63_financial_config WHERE singleton) AS finance,
       (SELECT enabled FROM public.dbk64_online_config WHERE singleton) AS online,
       (SELECT enabled FROM public.dbk65_online_fulfilment_config WHERE singleton) AS fulfillment,
       (SELECT enabled FROM public.dbk68_daraja_config WHERE singleton) AS daraja,
       (SELECT enabled FROM public.dbk69_inventory_config WHERE singleton) AS inventory,
       to_regprocedure('public.dbk107_record_legacy_collection(jsonb)') IS NOT NULL AS receivables,
       to_regprocedure('public.dbk108_record_legacy_refund(jsonb)') IS NOT NULL AS refunds`;
     rows=Number(r?.rows||0); frozen=r?.frozen===true;
     const all=[r?.pos,r?.stock,r?.settlement,r?.ledger,r?.manual,r?.finance,
       r?.online,r?.fulfillment,r?.daraja,r?.inventory];
     off=all.every(x=>x===false); on=all.every(x=>x===true);
     finance=r?.receivables===true&&r?.refunds===true;
   }
 }catch{dbOk=false}
 const flagsMatch=Object.entries(FLAGS).every(([k,v])=>env[k]===v);
 const sanity=env.NEXT_PUBLIC_SANITY_PROJECT_ID==='g34n810u'&&
  (env.NEXT_PUBLIC_SANITY_DATASET||'production')==='production'&&
  Boolean(env.SANITY_API_WRITE_TOKEN||env.SANITY_API_READ_TOKEN||env.SANITY_API_TOKEN);
 const paystack=env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_')===true;
 const site=env.NEXT_PUBLIC_SITE_URL||'';
 const cb=env.MPESA_CALLBACK_URL||'';
 let callbackOk=false;
 try{
   const s=new URL(site),c=new URL(cb);
   callbackOk=s.protocol==='https:'&&c.protocol==='https:'&&s.origin===c.origin&&
     c.pathname==='/api/payments/mobile/callback'&&s.pathname==='/'&&
     !s.username&&!s.password&&!c.username&&!c.password;
 }catch{}
 const mpesa=env.MPESA_ENV==='production'&&callbackOk&&
  Boolean(env.MPESA_CONSUMER_KEY&&env.MPESA_CONSUMER_SECRET&&env.MPESA_PASSKEY&&env.MPESA_SHORTCODE);
 const common=dbOk&&flagsMatch&&sanity&&paystack&&mpesa&&finance&&rows>0;
 const status=common&&off?'DBK115_STAGE_READY':
   common&&on?(frozen?'DBK115_LIVE_FROZEN':'DBK115_LIVE_OPEN'):'DBK115_HOLD';
 return NextResponse.json({status,allFlagsMatch:flagsMatch,databaseIdentityValid:dbOk,
   sanityValid:sanity,livePaystack:paystack,mpesaReady:mpesa,
   financeSchemaReady:finance,stockGatesOff:off,stockGatesOn:on,
   stockRows:rows,maintenanceFrozen:frozen},
   {status:status==='DBK115_HOLD'?503:200,headers:{'Cache-Control':'no-store'}});
}
