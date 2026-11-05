import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isExistingReadOnlyAdminGoogleAccount as allowed } from '../lib/auth/google-readonly-policy.ts';
import { allowLocalReadOnlyStaffAuthPost as bypass } from '../lib/auth/local-test-auth-policy.ts';

const admin = { googleId:'google-sub-123', email:'admin@example.test', status:'ACTIVE', role:'ADMIN' };
const isolated = {
  NODE_ENV: 'development',
  DBK36_TEST_WEBHOOK_BYPASS: 'YES',
  DBK36_TEST_READ_ONLY_STAFF_AUTH: 'YES',
  SANITY_API_READ_TOKEN: 'viewer-example',
  DATABASE_URL:'postgresql://test:secret@ep-sample-pooler.c-8.eu-central-1.aws.neon.tech/neondb',
};

test('existing linked active ADMIN may authenticate in isolated read-only test', () => {
  assert.equal(allowed(admin,'google-sub-123','ADMIN@example.test'),true);
});
test('reject unknown and unlinked Google account, even when email matches', () => {
  assert.equal(allowed(null,'google-sub-123','admin@example.test'),false);
  assert.equal(allowed({...admin,googleId:undefined},'google-sub-123','admin@example.test'),false);
  assert.equal(allowed({...admin,googleId:'other-sub'},'google-sub-123','admin@example.test'),false);
});
test('reject suspended and non-admin account', () => {
  assert.equal(allowed({...admin,status:'SUSPENDED'},'google-sub-123','admin@example.test'),false);
  assert.equal(allowed({...admin,role:'CUSTOMER'},'google-sub-123','admin@example.test'),false);
  assert.equal(allowed({...admin,role:'STORE'},'google-sub-123','admin@example.test'),false);
});
test('reject mismatched/blank email', () => {
  assert.equal(allowed({...admin,email:'someone@example.test'},'google-sub-123','admin@example.test'),false);
  assert.equal(allowed({...admin,email:''},'google-sub-123','admin@example.test'),false);
});
test('NextAuth sign-in bypasses DBK-74 only on the exact local test routes', () => {
  for (const path of ['/api/auth/signin/google','/api/auth/callback/credentials','/api/auth/signout']) {
    assert.equal(bypass('POST',path,isolated),true);
  }
});
test('rejects GET, business writes and arbitrary NextAuth actions', () => {
  for (const path of ['/api/checkout','/api/backoffice/whatsapp','/api/orders','/api/auth/callback/unknown','/api/auth/session']) {
    assert.equal(bypass('POST',path,isolated),false,path);
  }
  assert.equal(bypass('GET','/api/auth/signin/google',isolated),false);
});
test('production and preview can never bypass the maintenance barrier', () => {
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,NODE_ENV:'production'}),false);
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,VERCEL_ENV:'preview'}),false);
});
test('production Neon and arbitrary PostgreSQL cannot bypass maintenance barrier', () => {
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,DATABASE_URL:'postgresql://t:p@ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech/neondb'}),false);
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,DATABASE_URL:'postgresql://t:p@db.example.com/neondb'}),false);
});
test('read-only flags, Viewer token and database connection are mandatory', () => {
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,DBK36_TEST_READ_ONLY_STAFF_AUTH:'NO'}),false);
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,SANITY_API_READ_TOKEN:undefined}),false);
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,SANITY_API_WRITE_TOKEN:'write'}),false);
  assert.equal(bypass('POST','/api/auth/signin/google',{...isolated,DATABASE_URL:undefined}),false);
});
test('Google sign-in uses lookup before mutating ensureGoogleCustomer', () => {
  const code = readFileSync(new URL('../lib/auth/options.ts', import.meta.url),'utf8');
  const ro = code.indexOf('if (isLocalReadOnlyStaffAuth(process.env))');
  const create = code.indexOf('const customer = await ensureGoogleCustomer(');
  assert.ok(ro > 0 && create > ro);
  assert.match(code, /getGoogleCustomer\(account\.providerAccountId\)/);
});
test('existing role authorization and proxy barrier remain in place', () => {
  const auth=readFileSync(new URL('../lib/auth/authorization.ts',import.meta.url),'utf8');
  const proxy=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
  assert.match(auth,/customer\.status !== "ACTIVE"/);
  assert.match(auth,/getServerSession\(authOptions\)/);
  assert.match(proxy,/const needsRead = isWriteMethod/);
  assert.match(proxy,/allowLocalReadOnlyStaffAuthPost\(request\.method, pathname, process\.env\)/);
});
