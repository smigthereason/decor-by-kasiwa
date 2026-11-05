import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isExistingReadOnlyAdminGoogleAccount as allow } from '../lib/auth/google-readonly-policy.ts';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const store = read('lib/auth/local-readonly-customer.ts');
const auth = read('lib/auth/options.ts');
const guard = read('lib/auth/authorization.ts');
const client = read('sanity/lib/serverClient.ts');

test('Google local lookup uses the Viewer-capable Sanity server client', () => {
  assert.match(store, /import \{ serverClient \} from "@\/sanity\/lib\/serverClient"/);
  assert.match(client, /resolveSanityServerConfig\(process\.env\)/);
});

test('local Google lookup binds verified Google subject, never email-only match', () => {
  assert.match(store, /_type == "customerUser" && googleId == \$googleId/);
  assert.match(store, /\{ googleId \}/);
  assert.doesNotMatch(store, /lower\(email\) == \$email/);
});

test('protected admin account lookup requires exact document ID and customer type', () => {
  assert.match(store, /_type == "customerUser" && _id == \$id/);
  assert.match(store, /\{ id \}/);
  assert.match(store, /id\.startsWith\("drafts\."\)/);
});

test('read-only lookups have no mutation path or privileged token dependency', () => {
  assert.doesNotMatch(store, /SANITY_API_WRITE_TOKEN|\.patch\(|\.create\(|\.delete\(|\.mutate\(|\.transaction\(/);
  assert.match(store, /assertLocalReadOnlyMode\(\)/);
  assert.match(store, /process\.env\.VERCEL_ENV/);
});

test('signIn read-only branch calls the new Google lookup, not legacy write-dependent service', () => {
  assert.match(auth, /if \(isLocalReadOnlyStaffAuth\(process\.env\)\) \{\s*const existing = await getLocalReadOnlyGoogleCustomer\(account\.providerAccountId\)/);
  assert.match(auth, /return isExistingReadOnlyAdminGoogleAccount\(existing, account\.providerAccountId, user\.email\)/);
});

test('JWT also uses read-only lookup and rejects revoked account when necessary', () => {
  assert.match(auth, /localReadOnly\s*\? await getLocalReadOnlyGoogleCustomer\(account\.providerAccountId\)\s*: await getGoogleCustomer\(account\.providerAccountId\)/);
  assert.match(auth, /localReadOnly && !isExistingReadOnlyAdminGoogleAccount\(/);
  assert.match(auth, /delete token\.customerId/);
  assert.match(auth, /delete token\.role/);
});

test('production Google account creation and original lookup remain unchanged', () => {
  assert.match(auth, /await ensureGoogleCustomer\(/);
  assert.match(auth, /: await getGoogleCustomer\(account\.providerAccountId\)/);
});

test('admin route makes a current-record read without legacy write-token client in local mode', () => {
  assert.match(guard, /isLocalReadOnlyStaffAuth\(process\.env\)\s*\? await getLocalReadOnlyCustomerById\(session\.user\.id\)\s*: await getCustomerByDocumentId\(session\.user\.id\)/);
  assert.match(guard, /customer\.status !== "ACTIVE"/);
  assert.match(guard, /permissions\[surface\]/);
  assert.match(guard, /allowedRoles\.includes\(customer\.role\)/);
});

test('an existing linked ACTIVE ADMIN is required; no email-only privilege path', () => {
  const admin = { googleId:'google-sub-123',email:'admin@example.test',status:'ACTIVE',role:'ADMIN'};
  assert.equal(allow(admin,'google-sub-123','ADMIN@example.test'),true);
  assert.equal(allow({...admin,googleId:'wrong'},'google-sub-123','admin@example.test'),false);
  assert.equal(allow({...admin,role:'CUSTOMER'},'google-sub-123','admin@example.test'),false);
  assert.equal(allow({...admin,status:'SUSPENDED'},'google-sub-123','admin@example.test'),false);
  assert.equal(allow({...admin,email:'other@example.test'},'google-sub-123','admin@example.test'),false);
  assert.equal(allow(null,'google-sub-123','admin@example.test'),false);
});
