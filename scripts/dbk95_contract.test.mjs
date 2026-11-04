import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(p,'utf8');
const pos=load('lib/pos/server.ts');
const online=load('lib/paystack/server.ts');
const operations=load('lib/pos/operations.ts');
const journal=load('lib/pos/dbk95-transaction-audit.ts');
const projector=load('lib/db/dbk95-project-audits.ts');
const recovery=load('scripts/dbk95_replay_transaction_audits.mjs');
const probe=load('scripts/dbk95_sanity_transaction_dryrun.mjs');
test('off by default with explicit Neon production approval and audit reader gates',()=>{
  assert.match(journal,/DBK95_TRANSACTION_AUDIT_STORE/);
  assert.match(journal,/DBK95_TRANSACTION_AUDIT_APPROVED/);
  assert.match(journal,/DBK_AUDIT_LIVE_READ/);
  assert.match(journal,/ep-steep-scene-bausr4ct/);
});
test('POS legacy audit is retained while journaling is in the same transaction',()=>{
  assert.match(pos,/transaction.patch\(entityId, patch => dbk95AppendAudit/);
  assert.match(pos,/transaction.createIfNotExists\(\{\s*_id: id,\s*_type: "auditEvent"/);
});
test('all POS transactional audit commits have postcommit recovery hooks',()=>{
  assert.equal((pos.match(/addAuditToTransaction\(\{/g)||[]).length,8);
  assert.ok((pos.match(/await dbk95ProjectAfterCommit\(/g)||[]).length>=7);
});
test('online Paystack audit uses order journal or legacy Sanity audit, not both',()=>{
  assert.match(online,/if \(!dbk95Online\) mutation.createIfNotExists/);
  assert.match(online,/dbk95AppendAudit\(next,dbk95Online\)/);
  assert.match(online,/await dbk95ProjectAfterCommit\(order._id\)/);
});
test('Neon projector does not adjust stock or payments',()=>{
  assert.match(projector,/INSERT INTO public.dbk_live_audit_events/);
  assert.doesNotMatch(projector,/(UPDATE|DELETE)\s+public\./i);
  assert.match(projector,/ON CONFLICT \(id\) DO NOTHING/);
});
test('replay defaults read-only; writes need explicit approval',()=>{
  assert.match(recovery,/process\.argv\.includes\('--project'\)/);
  assert.match(recovery,/DBK95_AUDIT_PROJECTOR_APPROVED/);
  assert.match(recovery,/mode==='project'/);
});

test('create-plus-patch probe uses nonpersisting Sanity dryRun',()=>{
 assert.match(probe,/dryRun=true/);
 assert.match(probe,/persistedProbeDocuments:0/);
 assert.match(probe,/value.result!==0/);
});

test('returns and refunds journal their audit in the existing Sanity transaction',()=>{
 assert.match(operations,/if\(dbk95ReturnAudit\) transaction.patch\(order.id/);
 assert.match(operations,/else transaction.createIfNotExists\(\{\s*_id: `auditEvent/);
 assert.match(operations,/await dbk95ProjectAfterCommit\(order.id\)/);
});
