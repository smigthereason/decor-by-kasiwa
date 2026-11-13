import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest, checkCandidate, ALLOWED_EVENTS } from './dbk49_core.mjs';

const d = { _id: 'auditEvent.xyz', _type:'auditEvent', _rev:'one', _createdAt:'2026-10-20T00:00:00Z', _updatedAt:'2026-10-20T00:00:00Z', eventType:'POS_MANUAL_PAYMENT_RECORDED', detail:'test' };
const a = {document_type:'auditEvent', sanity_id:d._id,source_revision:d._rev,source_sha256:digest(d),document_json:d};
const cutoff = Date.parse('2026-10-25T00:00:00Z');
test('matching immutable old event eligible',()=>assert.equal(checkCandidate(a,d,cutoff),null));
test('revisions change => stop',()=>assert.equal(checkCandidate(a,{...d,_rev:'new'},cutoff),'revision_mismatch'));
test('content change => stop',()=>assert.equal(checkCandidate(a,{...d,detail:'changed'},cutoff),'body_mismatch'));
test('young documents cannot retire',()=>assert.equal(checkCandidate(a,{...d,_createdAt:'2026-10-26T00:00:00Z',_rev:d._rev},cutoff),'body_mismatch'));
test('recent changes cannot retire with newly archived hash',()=>{const changed={...d,_updatedAt:'2026-10-26T00:00:00Z'};assert.equal(checkCandidate({...a,source_sha256:digest(changed)},changed,cutoff),'recent_update');});
test('unapproved events excluded',()=>{const other={...d,eventType:'POS_MPESA_STK_SENT'};assert.equal(checkCandidate({...a,document_json:other,source_sha256:digest(other)},other,cutoff),'event_type_not_allowed')});
test('pending events excluded',()=>{const other={...d,resolutionStatus:'PENDING'};assert.equal(checkCandidate({...a,document_json:other,source_sha256:digest(other)},other,cutoff),'open_resolution')});
test('approved types are deliberate finite list',()=>assert.equal(ALLOWED_EVENTS.length,8));
test('canonical hashing independent of key order',()=>assert.equal(digest({x:1,y:{a:1,b:2}}),digest({y:{b:2,a:1},x:1})));
