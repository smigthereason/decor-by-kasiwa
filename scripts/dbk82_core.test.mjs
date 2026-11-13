import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidate, fingerprint, verifiedArchive, validateOptions, PINNED_HOST, CONFIRM} from './dbk82_core.mjs';
const ago=days=>new Date(Date.now()-days*86400000).toISOString();
const d={_id:'auditEvent.abc',_type:'auditEvent',_rev:'rev123',_createdAt:ago(10),_updatedAt:ago(10),eventType:'STAFF_LOGIN'};
const live={_id:d._id,_rev:d._rev,resolutionStatus:'RESOLVED'};
test('older unchanged audit is eligible',()=>assert.equal(candidate(d,live,Date.now()),null));
test('recent or pending audit cannot be deleted',()=>{
  assert.equal(candidate({...d,_updatedAt:ago(1)},live,Date.now()),'recent_activity');
  assert.equal(candidate({...d,resolutionStatus:'PENDING'},live,Date.now()),'pending_resolution');
});
test('unreviewed event categories are held',()=>assert.equal(candidate({...d,eventType:'SALE'},live,Date.now()),'event_type_not_allowlisted'));
test('revision drift blocks deletion',()=>assert.equal(candidate(d,{...live,_rev:'other'},Date.now()),'revision_mismatch_or_missing'));
test('archive requires exact id type rev and full canonical SHA',()=>{
  const a={document_type:'auditEvent',sanity_id:d._id,source_revision:d._rev,source_sha256:fingerprint(d)};
  assert.ok(verifiedArchive(d,a));assert.equal(verifiedArchive({...d,eventType:'different'},a),false);
  assert.equal(verifiedArchive(d,{...a,source_revision:'other'}),false);
});
test('hash stable when object key order changes',()=>assert.equal(fingerprint({b:1,a:{z:2,x:3}}),fingerprint({a:{x:3,z:2},b:1})));
test('retire requires production reader verification and exact explicit confirmation',()=>{
  const base={mode:'retire',backupAgeMs:1000,backupBytes:200000,host:PINNED_HOST,backupSha:'a'.repeat(64),actualSha:'a'.repeat(64),acknowledged:false,confirm:CONFIRM};
  assert.throws(()=>validateOptions(base));assert.doesNotThrow(()=>validateOptions({...base,acknowledged:true}));
});
test('stale backup or wrong host always blocks archive',()=>{
  const b={mode:'archive',backupAgeMs:100,backupBytes:200000,host:'else.neon.tech',backupSha:'a'.repeat(64),actualSha:'a'.repeat(64)};
  assert.throws(()=>validateOptions(b));
  assert.throws(()=>validateOptions({...b,host:PINNED_HOST,backupAgeMs:8e6}));
});
