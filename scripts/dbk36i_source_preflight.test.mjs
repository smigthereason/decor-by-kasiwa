import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDbk36iSource } from './dbk36i_source_preflight.mjs';

test('all six production foundation source gates are implemented',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const result=inspectDbk36iSource(root);
  assert.equal(result.length,6);
  assert.equal(result.filter(x=>x.codeImplemented).length,6);
});
