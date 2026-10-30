import assert from 'node:assert/strict';
import test from 'node:test';
import {assessDBK76,normalizeDBK76StockRow,EXPECTED_STOCK,REQUIRED_GATES,READINESS_FIELDS} from './dbk76_readiness_core.mjs';
const base=()=>({identity:'production-neondb',freezeActive:true,stock:{...EXPECTED_STOCK},
  legacyReceivables:{count:0,amountKES:0},pendingCallbacks:0,paidUncommittedMpesa:0,paidUncommittedOnline:0,manualHistory:0,mpesaHistory:0,
  gates:REQUIRED_GATES.map(name=>({name,enabled:false})),
  dbk62:{reconciliation_fingerprint:EXPECTED_STOCK.fingerprint,
    ...Object.fromEntries(READINESS_FIELDS.map(k=>[k,true]))}});
test('read-only dashboard never grants GO on database evidence alone',()=>{
  const result=assessDBK76(base());assert.equal(result.status,'HOLD');
  assert.equal(result.databaseChecksPassed,true);
});
test('freeze missing blocks clearance',()=>{
  const state=base();state.freezeActive=false;
  assert.match(assessDBK76(state).blockers.join(' '),/freeze/i);
});
test('unreconciled callbacks and paid uncommitted payments block',()=>{
  const state=base();state.pendingCallbacks=1;state.paidUncommittedMpesa=1;state.paidUncommittedOnline=1;
  assert.equal(assessDBK76(state).blockers.length,3);
});
test('source seed drift blocks even if gate checks pass',()=>{
  const state=base();state.stock.onHand='541083';
  assert.match(assessDBK76(state).blockers.join(' '),/seed/);
});
test('missing gate and premature enabled gate both block',()=>{
  const state=base();state.gates.pop();assert.match(assessDBK76(state).blockers.join(' '),/ten/);
  state.gates=base().gates;state.gates[0].enabled=true;
  assert.match(assessDBK76(state).blockers.join(' '),/already enabled/);
});
test('DBK62 flags must not be inferred true',()=>{
  const state=base();state.dbk62.refunds_ready=false;
  assert.match(assessDBK76(state).blockers.join(' '),/refunds_ready/);
});
test('history record limits are treated as incomplete',()=>{
  const state=base();state.manualHistory=501;state.mpesaHistory=501;
  assert.match(assessDBK76(state).blockers.join(' '),/Manual POS history/);
  assert.match(assessDBK76(state).blockers.join(' '),/M-Pesa history/);
});
import {readFileSync} from 'node:fs';
test('manual POS history fetch checks for rows beyond the hard cap',()=>{
  const source=readFileSync(new URL('../lib/db/dbk62-pos-cutover.ts',import.meta.url),'utf8');
  assert.match(source,/ORDER BY o\.created_at DESC LIMIT 501/);
  assert.match(source,/rows\.length > 500/);
});
test('Daraja history fetch checks for rows beyond the hard cap',()=>{
  const source=readFileSync(new URL('../lib/db/dbk68-daraja-neon.ts',import.meta.url),'utf8');
  assert.match(source,/ORDER BY created_at DESC LIMIT 501/);
  assert.match(source,/rows\.length > 500/);
});

test('outstanding legacy Sanity debt blocks live authority transfer',()=>{
  const state=base();state.legacyReceivables={count:13,amountKES:1349372.96};
  assert.match(assessDBK76(state).blockers.join(' '),/Legacy Sanity receivables remain/);
});

test('normalizes actual production Neon SQL snake_case stock fields',()=>{
  const raw={rows:1083,on_hand:'541084',incoming:'91279',fingerprint:EXPECTED_STOCK.fingerprint};
  const state=base();state.stock=normalizeDBK76StockRow(raw);
  assert.deepEqual(state.stock,EXPECTED_STOCK);
  assert.equal(assessDBK76(state).stockSeedMatches,true);
  assert.equal(assessDBK76(state).databaseChecksPassed,true);
});
test('missing SQL stock row fails the seed check closed',()=>{
  const state=base();state.stock=normalizeDBK76StockRow(undefined);
  assert.equal(assessDBK76(state).stockSeedMatches,false);
});
test('live audit includes all positive legacy balances, regardless of payment status',()=>{
  const source=readFileSync(new URL('./dbk76_cutover_readiness.mjs',import.meta.url),'utf8');
  assert.match(source,/"amountKES": coalesce\(math::sum\(\*\[_type == "commerceOrder" && coalesce\(balanceDue,0\)>0\]\.balanceDue\),0\)/);
  const state=base();state.legacyReceivables={count:3,amountKES:30000,pendingOrPartiallyPaidCount:1,otherStatusCount:2};
  assert.match(assessDBK76(state).blockers.join(' '),/Legacy Sanity receivables remain/);
});
