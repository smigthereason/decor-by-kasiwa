import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLocalReadOnlyStaffAuth, resolveSanityServerConfig, blocksSanityMutation } from '../lib/auth/sanity-client-policy.ts';

const base = {
  NEXT_PUBLIC_SANITY_PROJECT_ID: 'testingproject',
  NEXT_PUBLIC_SANITY_DATASET: 'production',
  NODE_ENV: 'development',
};
const devReadOnly = {
  ...base,
  SANITY_API_READ_TOKEN: 'viewer-token',
  DBK36_TEST_READ_ONLY_STAFF_AUTH: 'YES',
};

test('production uses the original write token without changing project or dataset', () => {
  assert.deepEqual(resolveSanityServerConfig({...base, NODE_ENV:'production', SANITY_API_WRITE_TOKEN:'write-token'}), {
    projectId:'testingproject', dataset:'production', token:'write-token', readOnly:false
  });
});

test('explicit local read-only mode uses Viewer credential for staff reads', () => {
  assert.equal(isLocalReadOnlyStaffAuth(devReadOnly), true);
  assert.deepEqual(resolveSanityServerConfig(devReadOnly), {
    projectId:'testingproject', dataset:'production', token:'viewer-token', readOnly:true
  });
});

test('production never accepts Viewer credential as a substitute for the write token', () => {
  assert.equal(isLocalReadOnlyStaffAuth({...devReadOnly, NODE_ENV:'production'}), false);
  assert.throws(() => resolveSanityServerConfig({...devReadOnly, NODE_ENV:'production'}), /staff authentication is unavailable/);
});

test('development must explicitly opt into read-only staff authentication', () => {
  assert.throws(() => resolveSanityServerConfig({...devReadOnly, DBK36_TEST_READ_ONLY_STAFF_AUTH:'NO'}), /unavailable/);
  assert.throws(() => resolveSanityServerConfig({...base, SANITY_API_READ_TOKEN:'viewer'}), /unavailable/);
});

test('missing project and missing credentials fail closed', () => {
  assert.throws(() => resolveSanityServerConfig({...devReadOnly, NEXT_PUBLIC_SANITY_PROJECT_ID:''}), /PROJECT_ID/);
  assert.throws(() => resolveSanityServerConfig(base), /unavailable/);
});

test('write token takes precedence and disables read-only mode', () => {
  const options = resolveSanityServerConfig({...devReadOnly, SANITY_API_WRITE_TOKEN:'valid-write'});
  assert.equal(options.readOnly, false);
  assert.equal(options.token, 'valid-write');
  assert.equal(isLocalReadOnlyStaffAuth({...devReadOnly, SANITY_API_WRITE_TOKEN:'valid-write'}), false);
});

test('read-only facade rejects all exposed Sanity mutation entry points', () => {
  for (const name of ['create','createIfNotExists','createOrReplace','delete','patch','transaction','mutate','action','request','withConfig','clone']) {
    assert.equal(blocksSanityMutation(name), true, name);
  }
  assert.equal(blocksSanityMutation('fetch'), false);
  assert.equal(blocksSanityMutation('getDocument'), false);
});

test('production never accepts an undeclared NODE_ENV for local read-only mode', () => {
  assert.equal(isLocalReadOnlyStaffAuth({...devReadOnly, NODE_ENV:undefined}), false);
});

test('Sanity client does not demand a write token during module evaluation', () => {
  const source = readFileSync(new URL('../sanity/lib/serverClient.ts', import.meta.url), 'utf8');
  assert.match(source, /new Proxy/);
  assert.match(source, /function getClient/);
  assert.doesNotMatch(source, /throw new Error\("SANITY_API_WRITE_TOKEN is missing/);
});

test('staff role guard remains active and local password login still verifies the password', () => {
  const auth = readFileSync(new URL('../lib/auth/authorization.ts', import.meta.url), 'utf8');
  const pwd = readFileSync(new URL('../lib/auth/password-auth.ts', import.meta.url), 'utf8');
  assert.match(auth, /getServerSession\(authOptions\)/);
  assert.match(auth, /getCustomerByDocumentId\(session\.user\.id\)/);
  assert.match(auth, /customer\.status !== "ACTIVE"/);
  assert.match(auth, /allowedRoles\.includes\(customer\.role\)/);
  assert.match(pwd, /verifyPassword\(password, customer\.passwordHash\)/);
});
