#!/usr/bin/env node
// DBK-103 install-only additive database function; never changes gates or runs payments.
import {readFile} from 'node:fs/promises';
const host='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
if(process.argv.length!==3 || process.argv[2]!=='--install-main-production')
  throw Error('Use --install-main-production to install DBK103 function only');
const raw=process.env.DATABASE_URL;
if(!raw)throw Error('DATABASE_URL is missing');
const u=new URL(raw);
if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==host||u.pathname!=='/neondb')
  throw Error('Refusing non-production Neon database');
const {neon}=await import('@neondatabase/serverless');
const sql=neon(raw);
const path=new URL('../migration/dbk103-wa-neon-stock.sql',import.meta.url);
const body=await readFile(path,'utf8');
const marker='REVOKE ALL ON FUNCTION';
const split=body.lastIndexOf(marker);
if(split<0)throw Error('DBK103 function DDL missing security statement');
await sql.query(body.slice(0,split).trim());
await sql.query(body.slice(split).trim());
const r=await sql`SELECT to_regprocedure('public.dbk103_commit_verified_wa_stock(text,text)') IS NOT NULL AS installed`;
if(r[0]?.installed!==true)throw Error('DBK103 function installation unverified');
console.log(JSON.stringify({status:'DBK103_FUNCTION_INSTALLED',database:'pinned MAIN neondb',
  paymentInitiated:false,stockWritten:false,gatesChanged:false},null,2));
