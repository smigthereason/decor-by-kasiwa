import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PINNED_PRODUCTION_HOST, PINNED_SANITY_PROJECT, GATE_TABLES, OPERATIONAL_TABLES,
  verifyDestination, validatePlan, checkEmptyDatabaseState, verifyPersistedRows,
  validateApplyApproval, parseArguments,
} from './dbk71_production_seed_core.mjs';

const env = {
  DATABASE_URL:`postgresql://u:p@${PINNED_PRODUCTION_HOST}/neondb?sslmode=require`,
  DBK71_EXPECTED_PRODUCTION_HOST:PINNED_PRODUCTION_HOST,
  NEXT_PUBLIC_SANITY_PROJECT_ID:PINNED_SANITY_PROJECT,
  NEXT_PUBLIC_SANITY_DATASET:'production',
};
const row = {
  product_id:'p1',variant_id:'',location_id:'store-1',on_hand:42,incoming:7,
  product_revision:'rev-product',inventory_revision:'rev-inventory',
};
const quarantine = {
  product_id:'p2',variant_id:'__UNALLOCATED_VARIANT__',location_id:'__UNALLOCATED__',
  on_hand:475,incoming:0,product_revision:'rev-p2',inventory_revision:'rev-inv2',
};
const plan = {
  safeToSeed:true, problems:[],balanceCount:2,rows:[row,quarantine],
  quantityClassification:{quarantinedOnHand:475},
  quarantinedProducts:Array(9).fill({}),
  quantityTotals:{onHand:517,incoming:7},fingerprint:'a'.repeat(64),
};
const empty = {tables:Object.fromEntries(OPERATIONAL_TABLES.map(n=>[n,'0'])),
  gates:Object.fromEntries(GATE_TABLES.map(n=>[n,false])),seedFingerprint:null};

test('only exact known production DB, Sanity project and dataset allowed',()=>{
  assert.equal(verifyDestination(env).databaseHost,PINNED_PRODUCTION_HOST);
  assert.throws(()=>verifyDestination({...env,DATABASE_URL:env.DATABASE_URL.replace(PINNED_PRODUCTION_HOST,'ep-green-sea-ba4sybzn-pooler.c-8.eu-central-1.aws.neon.tech')}),/mismatch/);
  assert.throws(()=>verifyDestination({...env,DATABASE_URL:env.DATABASE_URL.replace('/neondb','/testdb')}),/mismatch/);
  assert.throws(()=>verifyDestination({...env,NEXT_PUBLIC_SANITY_PROJECT_ID:'other'}),/Sanity/);
  assert.throws(()=>verifyDestination({...env,NEXT_PUBLIC_SANITY_DATASET:'staging'}),/Sanity/);
  assert.throws(()=>verifyDestination({...env,DBK71_EXPECTED_PRODUCTION_HOST:'other'}),/audited/);
});
test('safe source plan requires exact quarantine preservation',()=>{
  assert.equal(validatePlan(plan),true);
  assert.throws(()=>validatePlan({...plan,quantityClassification:{quarantinedOnHand:474}}),/Quarantine changed/);
  assert.throws(()=>validatePlan({...plan,safeToSeed:false}),/unsafe/);
});
test('every gate is off and every operational table is empty',()=>{
  assert.equal(checkEmptyDatabaseState(empty),true);
  assert.throws(()=>checkEmptyDatabaseState({...empty,tables:{...empty.tables,dbk56_pos_orders:'1'}}),/already exists/);
  assert.throws(()=>checkEmptyDatabaseState({...empty,gates:{...empty.gates,dbk64_online_config:true}}),/gate/);
  assert.throws(()=>checkEmptyDatabaseState({...empty,seedFingerprint:'abc'}),/already seeded/);
  assert.throws(()=>checkEmptyDatabaseState({...empty,gates:{dbk51_stock_engine_config:false}}),/Missing gate/);
});
test('full persisted rows, revisions, fingerprint and quarantine verified',()=>{
  const rows = [row,quarantine].map(r=>({...r,on_hand:String(r.on_hand),incoming:String(r.incoming),seed_fingerprint:plan.fingerprint}));
  const checked = verifyPersistedRows(plan,rows,plan.fingerprint,false);
  assert.equal(checked.quarantined,'475');
  assert.equal(checked.onHand,'517');
  assert.throws(()=>verifyPersistedRows(plan,rows.map((r,i)=>i===0?{...r,on_hand:'41'}:r),plan.fingerprint,false),/differs/);
  assert.throws(()=>verifyPersistedRows(plan,rows.map((r,i)=>i===0?{...r,inventory_revision:'other'}:r),plan.fingerprint,false),/differs/);
  assert.throws(()=>verifyPersistedRows(plan,rows,'b'.repeat(64),false),/fingerprint/);
  assert.throws(()=>verifyPersistedRows(plan,rows,plan.fingerprint,true),/enabled/);
});
test('explicit freeze, archive hash and fingerprint are all required to apply',()=>{
  const fields={'confirm-freeze':'STOCK_WRITES_FROZEN','confirm-fingerprint':plan.fingerprint,'confirm-archive-sha256':'b'.repeat(64)};
  assert.equal(validateApplyApproval({fields,plan,archiveSha256:'b'.repeat(64),env:{DBK71_ALLOW_PRODUCTION_SEED:'YES'}}),true);
  assert.throws(()=>validateApplyApproval({fields,plan,archiveSha256:'b'.repeat(64),env:{}}),/ALLOW/);
  assert.throws(()=>validateApplyApproval({fields:{...fields,'confirm-freeze':'NO'},plan,archiveSha256:'b'.repeat(64),env:{DBK71_ALLOW_PRODUCTION_SEED:'YES'}}),/freeze/);
  assert.throws(()=>validateApplyApproval({fields,plan,archiveSha256:'a'.repeat(64),env:{DBK71_ALLOW_PRODUCTION_SEED:'YES'}}),/archive/);
});
test('review is default and cannot accidentally accept apply confirmations',()=>{
  assert.equal(parseArguments(['/tmp/data.tar.gz']).apply,false);
  assert.equal(parseArguments(['/tmp/data.tar.gz','--review']).apply,false);
  assert.equal(parseArguments(['/tmp/data.tar.gz','--apply']).apply,true);
  assert.throws(()=>parseArguments(['/tmp/data.tar.gz','--confirm-fingerprint=a']),/only valid/);
  assert.throws(()=>parseArguments(['/tmp/data.tar.gz','--review','--apply']),/either/);
});
