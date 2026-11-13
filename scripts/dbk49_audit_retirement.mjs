#!/usr/bin/env node
/**
 * DBK-49 guarded audit retirement. Default: read-only preflight.
 * COPY/RETENTION ONLY for allowlisted, immutable historical auditEvent rows
 * which already exist byte-for-byte in Neon DBK-46 archive.
 * NO inventory, order, payment, customer, stock, or asset mutations.
 */
import { createClient } from '@sanity/client';
import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ALLOWED_EVENTS, digest, checkCandidate, canonical } from './dbk49_core.mjs';

function stop(message) { throw new Error(`STOP: ${message}`); }
function required(name) { const v = process.env[name]; if(!v) stop(`${name} not configured`);return v; }
function batches(arr, size) {const o=[];for(let i=0;i<arr.length;i+=size)o.push(arr.slice(i,i+size));return o;}
const mode = process.argv[2] || 'preflight';
if (!['preflight','apply'].includes(mode) || process.argv.length > (mode === 'apply' ? 4 : 3)) {
  stop('Usage: node scripts/dbk49_audit_retirement.mjs preflight | apply /ABSOLUTE/PRIVATE/manifest.json');
}
const projectId = required('NEXT_PUBLIC_SANITY_PROJECT_ID');
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
if (dataset !== 'production') stop('Sanity dataset must be production');
const url = new URL(required('DATABASE_URL'));
const host = url.hostname;
if (!host || host !== required('DBK49_EXPECTED_NEON_HOST')) stop('DBK49_EXPECTED_NEON_HOST does not match DATABASE_URL');
const sanity = createClient({
  projectId, dataset, apiVersion: '2026-08-27',
  token: required('SANITY_API_WRITE_TOKEN').trim().replace(/^["']|["']$/g,''),
  useCdn: false, perspective: 'published',
});
const sql = neon(url.toString());
const limit = Number(process.env.DBK49_MAX_RECORDS || '5000');
const ageHours = Number(process.env.DBK49_MIN_AGE_HOURS || '24');
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 7500) stop('DBK49_MAX_RECORDS must be an integer from 1 to 7500');
if (!Number.isFinite(ageHours) || ageHours < 12 || ageHours > 8760) stop('Minimum age is 12 hours');

const [dbInfo] = await sql`SELECT COUNT(*)::int AS records FROM public.dbk_sanity_operational_archive WHERE document_type = 'auditEvent'`;
if (Number(dbInfo.records) < 9000) stop(`Only ${dbInfo.records} historical audit docs in this Neon DB; expected DBK-46 archive >= 9000`);

async function retryRead(label, request) {
  for (let attempt=1; attempt<=3; attempt++) {
    try { return await request(); }
    catch (error) {
      if (attempt===3) throw new Error(`${label} failed after 3 attempts: ${error.message}`, {cause:error});
      await new Promise(resolve=>setTimeout(resolve,attempt*500));
    }
  }
}
async function hasReferences(ids) {
  // This must work reliably. On failure, the program stops rather than deleting.
  const refs = await retryRead('Sanity incoming reference check',()=>sanity.fetch('count(*[references($ids)])', {ids}, {cache:'no-store'}));
  if (!Number.isSafeInteger(refs) || refs < 0) stop('Incoming reference count was invalid');
  return refs > 0;
}
async function liveRecords(ids) {
  const docs = await retryRead('Sanity live audit read',()=>sanity.fetch('*[_type == "auditEvent" && _id in $ids]', {ids}, {cache:'no-store'}));
  return new Map(docs.map(d => [d._id,d]));
}
const counts = {};
function skip(reason) {counts[reason] = (counts[reason]||0)+1;}

// Page archive reads so no one HTTP result contains thousands of full document JSON blobs.
// OFFSET preserves the original source_created_at/sanity_id ordering used by manifests.
const ARCHIVE_PAGE_SIZE = 60;
async function archivePage(offset) {
  return retryRead('Neon audit archive page',()=>sql`SELECT sanity_id, source_revision, source_sha256, document_type, document_json
    FROM public.dbk_sanity_operational_archive WHERE document_type = 'auditEvent'
    ORDER BY source_created_at ASC, sanity_id ASC
    LIMIT ${ARCHIVE_PAGE_SIZE} OFFSET ${offset}`);
}

if (mode === 'preflight') {
  const cutoff = Date.now() - ageHours*3600*1000;
  const eligible=[];
  for (let offset=0; offset<Number(dbInfo.records) && eligible.length<limit; offset+=ARCHIVE_PAGE_SIZE) {
    const rows = await archivePage(offset);
    if (!rows.length) break;
    const tentative = rows.filter(r => ALLOWED_EVENTS.includes(r.document_json?.eventType));
    for (const part of batches(tentative, 20)) {
      if (eligible.length >= limit) break;
      const live = await liveRecords(part.map(r=>r.sanity_id));
      const candidate = [];
      for (const row of part) {
        const reason = checkCandidate(row, live.get(row.sanity_id),cutoff);
        if (reason) skip(reason);
        else candidate.push({id:row.sanity_id,rev:row.source_revision,sha:row.source_sha256});
      }
      for (const sub of batches(candidate,20)) {
        if (eligible.length >= limit) break;
        if (await hasReferences(sub.map(s=>s.id))) {skip('incoming_reference_batch');continue;}
        eligible.push(...sub.slice(0,limit-eligible.length));
      }
    }
  }
  const payload={
    stage:'DBK-49',kind:'Sanity auditEvent retirement manifest', projectId,dataset,dbHost:host,
    archiveRecords:Number(dbInfo.records), minAgeHours:ageHours,
    cutoff:new Date(cutoff).toISOString(), createdAt:new Date().toISOString(),
    selected:eligible, skipCounts:counts,
  };
  const sha=digest(payload);
  const backupDir=resolve(process.env.DBK49_PRIVATE_DIR || `${process.env.HOME}/Downloads/DBK-sanity-private-backups`);
  mkdirSync(backupDir,{recursive:true,mode:0o700});
  const path=join(backupDir,`DBK49-retirement-${new Date().toISOString().replace(/[^\dTZ]/g,'-')}-${sha.slice(0,12)}.json`);
  writeFileSync(path,JSON.stringify({sha256:sha,payload},null,2),{mode:0o600,flag:'wx'});
  chmodSync(path,0o600);
  console.log(JSON.stringify({mode:'READ ONLY PREFLIGHT',archiveRecords:dbInfo.records, selected:eligible.length,
    cutoff:payload.cutoff,skipCounts:counts,manifestPath:path,manifestSha256:sha,
    note:'NOT approval to delete. Confirm production code/archive audit screens, current backup and complete audit recovery before apply.'},null,2));
  process.exit(0);
}

// All of the following gates are mandatory for destructive apply.
if(process.env.DBK49_PROD_CODE_DEPLOYED!=='YES') stop('Production code deployment not confirmed');
if(process.env.DBK49_PROD_AUDIT_HISTORY_VERIFIED!=='YES') stop('Production audit history not verified');
if(process.env.DBK49_OPERATOR_CONFIRMS_RETIREMENT!=='YES') stop('Explicit operator acknowledgement missing');
if(process.env.DBK49_RETIREMENT_PERMISSION!=='AUDIT-ONLY-ARCHIVED-MATCHING-REVISIONS') stop('Explicit scope acknowledgement missing');
const backup=resolve(required('DBK49_RECENT_SANITY_BACKUP'));
if(!existsSync(backup)||!backup.endsWith('.tar.gz')) stop('Fresh full Sanity document export required');
if(Date.now()-statSync(backup).mtimeMs>2*3600*1000) stop('Backup export older than 2h; make fresh export');
try {execFileSync('tar',['-tzf',backup],{stdio:'ignore',timeout:60000});} catch {stop('Backup archive does not pass tar integrity test');}
const file=resolve(process.argv[3]||'');
if(!existsSync(file)) stop('Manifest file not found');
const manifest=JSON.parse(readFileSync(file,'utf8'));
if(!manifest.payload || manifest.sha256 !== digest(manifest.payload) || manifest.sha256 !== required('DBK49_CONFIRM_MANIFEST_SHA256')) stop('Manifest checksum mismatch');
const p=manifest.payload;
if(p.projectId !== projectId || p.dataset !== dataset || p.dbHost !== host) stop('Manifest Sanity or Neon target mismatch');
if(!Number.isFinite(Date.parse(p.createdAt)) || Date.now()-Date.parse(p.createdAt)>3600*1000) stop('Manifest older than 1h; create fresh preflight');
if(!Array.isArray(p.selected)||!p.selected.length || p.selected.length>7500) stop('Manifest has invalid selection');
const cutoff = Date.parse(p.cutoff);
if(!Number.isFinite(cutoff)) stop('Manifest cutoff invalid');
// Recheck ALL records before the first destructive operation, so old manifests and edited records fail closed.
let verified=0;
const review=[];
const selectedIdSet = new Set(p.selected.map(item=>item.id));
const archiveById = new Map();
// Read archive rows in pages for the same bounded-memory/network behavior as preflight.
for (let offset=0; offset<Number(dbInfo.records) && archiveById.size<selectedIdSet.size; offset+=ARCHIVE_PAGE_SIZE) {
  const page = await archivePage(offset);
  if (!page.length) break;
  for (const row of page) {
    if (selectedIdSet.has(row.sanity_id)) archiveById.set(row.sanity_id,row);
  }
}
if (archiveById.size !== selectedIdSet.size) stop('One or more manifest documents are missing from the Neon archive');
for(const chunk of batches(p.selected,20)) {
  const byId=archiveById;
  const live=await liveRecords(chunk.map(x=>x.id));
  for(const item of chunk) {
    const row=byId.get(item.id);
    if(!row||row.source_revision!==item.rev||row.source_sha256!==item.sha) stop('Neon archive changed since manifest preflight');
    if(checkCandidate(row,live.get(item.id),cutoff)) stop('A selected Sanity document changed or became ineligible');
    verified++;
  }
  if(await hasReferences(chunk.map(x=>x.id))) stop('One or more selected audit documents gained incoming references');
  review.push(...chunk);
}
if(verified!==p.selected.length) stop('Pre-delete verification incomplete');
let removed=0;
for(const chunk of batches(review,20)) {
  // Fresh optimistic-locking recheck immediately before every batch.
  const live=await liveRecords(chunk.map(x=>x.id));
  if(await hasReferences(chunk.map(x=>x.id))) stop('Incoming reference detected immediately before delete');
  for (const item of chunk) {
    const d=live.get(item.id);
    if(!d || d._rev!==item.rev || digest(d)!==item.sha) stop('Revision/content changed just before delete');
  }
  const mutations=chunk.map(item=>({delete:{id:item.id,ifRevisionID:item.rev}}));
  await sanity.mutate(mutations,{returnDocuments:false,visibility:'sync'});
  const remain=await sanity.fetch('count(*[_id in $ids])',{ids:chunk.map(x=>x.id)},{cache:'no-store'});
  if(remain!==0) stop('Post-delete check nonzero; stop and reconcile');
  removed += chunk.length;
  console.log(`Verified and retired ${removed}/${p.selected.length} archived audit documents.`);
}
console.log(JSON.stringify({mode:'COMPLETE - SANITY AUDIT RETIREMENT ONLY',retired:removed,
  retainedInNeonArchive:true,inventoryWrites:0,orderWrites:0,paymentWrites:0,
  note:'Confirm Sanity quota and production screens. This does NOT migrate atomic inventory/payment writes.'},null,2));
