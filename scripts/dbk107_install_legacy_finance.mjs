#!/usr/bin/env node
// DBK107 install-only schema. No data, balances, payments, stock or env gates change.
import {readFile} from 'node:fs/promises';
const expected='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
if(process.argv.length!==3 || process.argv[2]!=='--install-main-production')
  throw Error('Use --install-main-production for additive DBK107 schema installation only');
const raw=process.env.DATABASE_URL;
if(!raw)throw Error('Missing DATABASE_URL');
const parsed=new URL(raw);
if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!==expected||parsed.pathname!=='/neondb')
  throw Error('Refusing unexpected Neon database');
const body=await readFile(new URL('../migration/dbk107-legacy-neon-receivables.sql',import.meta.url),'utf8');
const sql=(await import('@neondatabase/serverless')).neon(raw);
const first=body.indexOf('CREATE TABLE IF NOT EXISTS public.dbk107_legacy_receivable_accounts');
const second=body.indexOf('CREATE TABLE IF NOT EXISTS public.dbk107_legacy_receivable_collections');
const indexes=body.indexOf('CREATE INDEX IF NOT EXISTS');
const fn=body.indexOf('CREATE OR REPLACE FUNCTION');
const revoke=body.indexOf('REVOKE ALL ON FUNCTION');
if([first,second,indexes,fn,revoke].some(x=>x<0))throw Error('DBK107 SQL format changed; refusing install');
for(const statement of [body.slice(first,second),body.slice(second,indexes)]) await sql.query(statement.trim());
// Index statements are safe to run separately, no user data changes.
for(const indexStmt of body.slice(indexes,fn).split(';').map(x=>x.trim()).filter(Boolean))
  await sql.query(indexStmt);
await sql.query(body.slice(fn,revoke).trim());
await sql.query(body.slice(revoke).trim());
const present=await sql`SELECT to_regprocedure('public.dbk107_record_legacy_collection(jsonb)') IS NOT NULL AS installed`;
if(present[0]?.installed!==true)throw Error('DBK107 schema verification failed');
console.log(JSON.stringify({status:'DBK107_LEGACY_NEON_SCHEMA_INSTALLED',database:'pinned MAIN neondb',
  legacyCollectionCountChanged:false,balancesChanged:false,gatesChanged:false},null,2));
