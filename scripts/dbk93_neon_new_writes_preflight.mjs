#!/usr/bin/env node
// DBK-93: read-only. Run from repository root with env-file options.
import { execFileSync } from 'node:child_process';
import { assessDBK93, TARGET_FLAGS } from './dbk93_new_writes_core.mjs';
let audit;
let auditError;
try {
  const output=execFileSync(process.execPath,['scripts/dbk76_cutover_readiness.mjs'],
    {cwd:process.cwd(),encoding:'utf8',env:process.env,timeout:90000,maxBuffer:2000000,
     stdio:['ignore','pipe','pipe']});
  audit=JSON.parse(output.trim());
} catch(e) {
  // Do not print exception bodies: provider or database SDK messages can contain secrets.
  auditError=`DBK-76 failed (code ${e?.status ?? 'unknown'}); see its standalone safe diagnostic`;
}
const result=assessDBK93({url:process.env.DATABASE_URL,
  flags:Object.fromEntries(Object.keys(TARGET_FLAGS).map(k=>[k,process.env[k]])),audit});
if(auditError) result.blockers.unshift(auditError);
console.log(JSON.stringify(result,null,2));
if(result.blockers.length) process.exitCode=2;
