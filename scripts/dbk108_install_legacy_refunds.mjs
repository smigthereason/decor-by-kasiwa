#!/usr/bin/env node
// DBK108 schema-only installation. NEVER enables cutover gates or sends money.
import {readFile} from 'node:fs/promises';
if(process.argv.length!==3||process.argv[2]!=='--install-main-production')
  throw Error('Use --install-main-production to install the additive schema');
const raw=process.env.DATABASE_URL;
if(!raw) throw Error('DATABASE_URL is missing');
const u=new URL(raw);
if(u.hostname!=='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech'||u.pathname!=='/neondb')
  throw Error('Refusing unexpected Neon database');
const sql=(await import('@neondatabase/serverless')).neon(raw);
const body=await readFile(new URL('../migration/dbk108-legacy-neon-refunds.sql',import.meta.url),'utf8');
const parts=[
  'CREATE TABLE IF NOT EXISTS public.dbk108_legacy_refund_accounts',
  'CREATE TABLE IF NOT EXISTS public.dbk108_legacy_refunds',
  'CREATE INDEX IF NOT EXISTS dbk108_legacy_refunds_order_idx',
  'CREATE INDEX IF NOT EXISTS dbk108_legacy_refunds_date_idx',
  'CREATE OR REPLACE FUNCTION public.dbk108_record_legacy_refund',
  'REVOKE ALL ON FUNCTION public.dbk108_record_legacy_refund',
];
const offsets=parts.map(t=>body.indexOf(t));
if(offsets.some(x=>x<0)||offsets.some((x,i)=>i&&x<=offsets[i-1]))
  throw Error('Migration format mismatch: refusing arbitrary SQL');
for(let i=0;i<parts.length;i++) {
  const segment=body.slice(offsets[i],offsets[i+1]||body.length).trim();
  if(segment) await sql.query(segment);
}
const result=await sql`SELECT to_regprocedure('public.dbk108_record_legacy_refund(jsonb)') IS NOT NULL AS installed`;
if(result[0]?.installed!==true) throw Error('DBK108 schema verification failed');
console.log(JSON.stringify({status:'DBK108_LEGACY_REFUND_SCHEMA_INSTALLED',
  transactionDataChanged:false,stockChanged:false,gatesChanged:false},null,2));
