// DBK74 read-only status; never changes freeze or payment state.
import { neon } from '@neondatabase/serverless';
const target='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
if(!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const uri=new URL(process.env.DATABASE_URL);
if(uri.hostname!==target || decodeURIComponent(uri.pathname.slice(1))!=='neondb')
  throw new Error('Database host/name mismatch; no query attempted');
const sql=neon(process.env.DATABASE_URL);
const control=await sql`SELECT active,updated_at,operator_note FROM public.dbk74_freeze_control WHERE singleton=true`;
const counts=await sql`SELECT provider,reconciliation_status,count(*)::text AS count FROM public.dbk74_queued_callbacks GROUP BY provider,reconciliation_status`;
if(control.length!==1) throw new Error('DBK74 control missing');
console.log(JSON.stringify({production:true,freezeActive:control[0].active,updatedAt:control[0].updated_at,
  callbackSummary:counts},null,2));
