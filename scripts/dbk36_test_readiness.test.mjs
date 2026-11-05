import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSnapshot, freshnessStatus, safeMetaStatus } from './dbk36_test_readiness.mjs';

const now = Date.parse('2026-11-05T00:00:00Z');
const snap = (mins, overrides = {}) => ({
  catalogue: {product_count:196, category_count:35, image_count:100, synced_at:new Date(now-mins*60_000).toISOString()},
  queue:{done:22, pending:0, failed:0, processing:0},
  stuck_processing:0, human_count:0,
  ...overrides,
});
const flags = {WHATSAPP_BOT_ENABLED:'YES',DBK36_ENABLE_REPLIES:'YES'};

test('fresh cache reports 196 products, 35 categories and partial image coverage', () => {
  const r=assessSnapshot(snap(30),now,flags);
  assert.deepEqual(r.catalogue, {status:'fresh',products:196,categories:35,images:100,imageCoveragePct:51,ageMinutes:30});
  assert.equal(r.findings.length,0);
});
test('stale cache is warned, and expires beyond grace', () => {
  assert.equal(freshnessStatus(new Date(now-60*60_000).toISOString(),now),'fresh');
  assert.equal(freshnessStatus(new Date(now-61*60_000).toISOString(),now),'stale');
  assert.equal(freshnessStatus(new Date(now-421*60_000).toISOString(),now),'expired');
  assert.match(assessSnapshot(snap(61),now,flags).findings.join(','),/WARN: catalogue/);
  assert.match(assessSnapshot(snap(421),now,flags).findings.join(','),/BLOCK: catalogue/);
});
test('empty cache is blocked, not declared ready', () => {
  const r=assessSnapshot({catalogue:null,queue:{},human_count:0},now,flags);
  assert.equal(r.catalogue.status,'missing');
  assert.ok(r.findings.some(f=>f.startsWith('BLOCK:')));
});
test('flags and queue failures prompt checks', () => {
  const r=assessSnapshot(snap(20,{queue:{failed:2,pending:1},stuck_processing:3}),now,{});
  assert.ok(r.findings.some(f=>f.includes('failed')));
  assert.ok(r.findings.some(f=>f.includes('processing')));
  assert.ok(r.findings.some(f=>f.includes('flag')));
});
test('no images is explicitly flagged but not fabricated', () => {
  const r=assessSnapshot(snap(20,{catalogue:{...snap(20).catalogue,image_count:0}}),now,flags);
  assert.ok(r.findings.some(f=>f.includes('eligible public images')));
});
test('Meta status sanitizes errors and never exposes raw response', () => {
  assert.deepEqual(safeMetaStatus(200,{id:'1234'}),{httpStatus:200,phoneAccessible:true,errorCode:null,errorSubcode:null});
  const failure=safeMetaStatus(401,{error:{code:190,error_subcode:463,message:'token and confidential info'}});
  assert.deepEqual(failure,{httpStatus:401,phoneAccessible:false,errorCode:190,errorSubcode:463});
  assert.doesNotMatch(JSON.stringify(failure),/confidential info/);
});
test('future timestamps fail closed',()=>{
  assert.equal(freshnessStatus(new Date(now+90_000).toISOString(),now),'expired');
});
test('script is read-only and cannot expose secrets from query results',async()=>{
  const fs=await import('node:fs');
  const source=fs.readFileSync(new URL('./dbk36_test_readiness.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/sql`(?:\s)*(?:INSERT|UPDATE|DELETE|TRUNCATE)/i);
  assert.doesNotMatch(source,/console\.log\((?:process\.env|env\.|safe\.databaseUrl)/);
});
