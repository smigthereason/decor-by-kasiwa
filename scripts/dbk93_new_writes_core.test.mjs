import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDBK93,PRODUCTION_HOST,TARGET_FLAGS} from './dbk93_new_writes_core.mjs';
const goodAudit={assessment:{databaseChecksPassed:true,status:'HOLD',blockers:[]},observed:{dbk90:{rowsMatch:true}}};
test('rejects test Neon DB',()=>{
  const r=assessDBK93({url:'postgres://a:b@test.neon.tech/neondb',flags:TARGET_FLAGS,audit:goodAudit});
  assert.equal(r.databaseIdentityOk,false);
  assert.equal(r.activationAuthorized,false);
});
test('propagates real DBK-76 blockers',()=>{
  const r=assessDBK93({url:`postgres://u:password@${PRODUCTION_HOST}/neondb`,flags:TARGET_FLAGS,
    audit:{assessment:{databaseChecksPassed:false,blockers:['legacy receivables remain']}}});
  assert.match(r.blockers.join(' '),/legacy receivables/);
});
test('does not authorize production even if local checks pass',()=>{
  const r=assessDBK93({url:`postgres://u:password@${PRODUCTION_HOST}/neondb`,flags:TARGET_FLAGS,audit:goodAudit});
  assert.equal(r.databaseIdentityOk,true);
  assert.equal(r.activationAuthorized,false);
  assert.equal(JSON.stringify(r).includes('password'),false);
});
test('detects missing inventory flag',()=>{
  const r=assessDBK93({url:`postgres://u:p@${PRODUCTION_HOST}/neondb`,
    flags:{...TARGET_FLAGS,DBK_INVENTORY_BACKEND:'sanity'},audit:goodAudit});
  assert.match(r.blockers.join(' '),/DBK_INVENTORY_BACKEND/);
});
