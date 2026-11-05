import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowLocalWhatsAppStaffTestPost as allowed } from '../lib/auth/local-test-auth-policy.ts';

const isolated = {
  NODE_ENV: 'development',
  DBK36_TEST_WEBHOOK_BYPASS: 'YES',
  DBK36_TEST_READ_ONLY_STAFF_AUTH: 'YES',
  SANITY_API_READ_TOKEN: 'example-viewer',
  WHATSAPP_TEST_RECIPIENTS: '254707098723,+254712345678',
  DATABASE_URL: 'postgresql://test:example@ep-example-pooler.c-8.eu-central-1.aws.neon.tech/neondb',
};
const path = '/api/backoffice/whatsapp/254707098723';

test('allows an exact, allowlisted WhatsApp admin POST on the local isolated branch', () => {
  assert.equal(allowed('POST', path, isolated), true);
  assert.equal(allowed('POST', '/api/backoffice/whatsapp/254712345678', isolated), true);
});
test('denies non-allowlisted and malformed conversation identifiers', () => {
  for (const url of ['/api/backoffice/whatsapp/254700000000', '/api/backoffice/whatsapp/999000000000', '/api/backoffice/whatsapp/abc', '/api/backoffice/whatsapp/254707098723/']) {
    assert.equal(allowed('POST', url, isolated), false, url);
  }
});
test('denies other methods and unrelated routes including activity and business writes', () => {
  for (const method of ['GET','PATCH','PUT','DELETE']) assert.equal(allowed(method,path,isolated),false);
  for (const url of ['/api/backoffice/activity','/api/backoffice/whatsapp','/api/orders','/api/checkout','/api/whatsapp/process','/api/backoffice/overview']) {
    assert.equal(allowed('POST',url,isolated),false,url);
  }
});
test('rejects production and preview deployments', () => {
  assert.equal(allowed('POST',path,{...isolated,NODE_ENV:'production'}),false);
  assert.equal(allowed('POST',path,{...isolated,VERCEL_ENV:'preview'}),false);
  assert.equal(allowed('POST',path,{...isolated,VERCEL_ENV:'production'}),false);
});
test('rejects production and non-Neon database connections', () => {
  const production = 'postgresql://test:example@ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech/neondb';
  for (const database of [production, 'postgresql://t:p@localhost:5432/neondb','postgresql://t:p@db.example.com/neondb', undefined]) {
    assert.equal(allowed('POST',path,{...isolated,DATABASE_URL:database}),false);
  }
});
test('rejects missing opt-ins and Sanity Viewer credential', () => {
  for (const key of ['DBK36_TEST_WEBHOOK_BYPASS','DBK36_TEST_READ_ONLY_STAFF_AUTH','SANITY_API_READ_TOKEN']) {
    assert.equal(allowed('POST',path,{...isolated,[key]:undefined}),false);
  }
  assert.equal(allowed('POST',path,{...isolated,SANITY_API_WRITE_TOKEN:'privileged'}),false);
});
test('rejects missing or invalid recipient allowlists', () => {
  for (const recipients of [undefined,'','not-a-number','12345']) {
    assert.equal(allowed('POST',path,{...isolated,WHATSAPP_TEST_RECIPIENTS:recipients}),false);
  }
});
test('the exact WhatsApp route retains ADMIN and same-origin authorization', () => {
  const route = readFileSync(new URL('../app/api/backoffice/whatsapp/[waId]/route.ts',import.meta.url),'utf8');
  assert.match(route, /getApiStaff\(\['ADMIN'\]\)/);
  assert.match(route, /if \(!sameOrigin\(request\)\)/);
  assert.match(route, /if \(!\/\^\\d\{7,16\}\$\/\.test\(waId\)\)/);
});
test('proxy only short circuits before production DBK-74 via named policy', () => {
  const proxy = readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
  assert.match(proxy, /allowLocalWhatsAppStaffTestPost\(request\.method, pathname, process\.env\)/);
  assert.match(proxy, /const needsRead = isWriteMethod\(request\.method\)/);
  assert.match(proxy, /code: 'DBK74_UNAVAILABLE'/);
});
