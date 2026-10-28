import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceRecords, planSync } from './dbk44_inventory_core.mjs';

const doc = (id, rev, stamp, note='same') => ({_type:'inventoryMovement', _id:`inventoryMovement.${id}`, _rev:rev,
  _createdAt:'2026-10-01T01:00:00.000Z', _updatedAt:stamp, note});
const row = d => ({sanity_id:d._id, source_revision:d._rev, source_updated_at:d._updatedAt, document_json:d});
const early='2026-10-01T10:00:00.000Z'; const late='2026-10-02T10:00:00.000Z';
test('extracts rows and creates stable snapshot SHA', () => {
  const text = JSON.stringify(doc('1','a',early))+'\n';
  const one = parseSourceRecords(text);
  const two = parseSourceRecords(text);
  assert.equal(one.fingerprint, two.fingerprint);
  assert.equal(one.rows.length, 1);
});
test('plans insert/update/match without mutating archived data', () => {
  const archived = [row(doc('a','v1',early)),row(doc('b','v1',early)),row(doc('d','v1',early))];
  const source = [row(doc('a','v1',early)),row(doc('b','v2',late)),row(doc('c','v1',late))];
  const result=planSync(source,archived);
  assert.equal(result.safeToApply,true);
  assert.deepEqual([result.counts.matchingIdRevisionAndBody, result.counts.toInsert, result.counts.toUpdate, result.counts.archiveIdsAbsentFromSnapshot], [1,1,1,1]);
});
test('blocks old snapshots from overwriting new revisions', () => {
  const result=planSync([row(doc('a','old',early))],[row(doc('a','new',late))]);
  assert.equal(result.safeToApply,false);
  assert.equal(result.counts.sourceOlderThanArchive,1);
});
test('blocks equal timestamp revisions and same revision changed body', () => {
  assert.equal(planSync([row(doc('a','new',early))],[row(doc('a','old',early))]).safeToApply,false);
  assert.equal(planSync([row(doc('a','v1',early,'different'))],[row(doc('a','v1',early))]).safeToApply,false);
});
test('rejects duplicate source records', () => {
  assert.throws(()=>parseSourceRecords([doc('a','v1',early),doc('a','v1',early)].map(JSON.stringify).join('\n')));
});
test('handles key ordering changes in unchanged JSONB documents', () => {
  const base=doc('a','v1',early);
  const rearranged = {note:base.note,_rev:base._rev,_id:base._id,_updatedAt:base._updatedAt,_createdAt:base._createdAt,_type:base._type};
  assert.equal(planSync([row(base)],[row(rearranged)]).counts.matchingIdRevisionAndBody,1);
});
