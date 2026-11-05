import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPermittedWhatsAppStaffOrigin as originAllowed } from '../lib/auth/local-test-auth-policy.ts';

const local = 'http://127.0.0.1:3100';
const path = '/api/backoffice/whatsapp/254707098723';
const env = {
  NODE_ENV: 'development',
  DBK36_TEST_WEBHOOK_BYPASS: 'YES',
  DBK36_TEST_READ_ONLY_STAFF_AUTH: 'YES',
  SANITY_API_READ_TOKEN: 'local-viewer-example',
  NEXTAUTH_URL: local,
  WHATSAPP_TEST_RECIPIENTS: '254707098723',
  DATABASE_URL: 'postgresql://test:test@ep-example-pooler.c-8.eu-central-1.aws.neon.tech/neondb',
};

test('retains ordinary same-origin for production as well as development', () => {
  assert.equal(originAllowed('https://www.decorbykasiwa.co.ke', 'https://www.decorbykasiwa.co.ke'+path, 'POST', {NODE_ENV:'production'}), true);
  assert.equal(originAllowed(local, local+path, 'POST', env), true);
});
test('accepts exact local origin when an internal request URL has a different host', () => {
  assert.equal(originAllowed(local, 'http://localhost:3100'+path, 'POST', env), true);
  assert.equal(originAllowed(local, 'http://localhost:3000'+path, 'POST', env), true);
});
test('never accepts missing, malformed, path-bearing, or unrelated origins', () => {
  for (const origin of [null, '', 'null', 'https://evil.example', 'http://localhost:3000', local+'/', local+'/evil']) {
    assert.equal(originAllowed(origin, 'http://localhost:3100'+path, 'POST', env), false, String(origin));
  }
});
test('rejects fallback for unrelated and business-write endpoints', () => {
  for (const p of ['/api/backoffice/activity','/api/backoffice/overview','/api/checkout','/api/orders','/api/backoffice/whatsapp']) {
    assert.equal(originAllowed(local, 'http://localhost:3100'+p, 'POST', env),false,p);
  }
});
test('rejects fallback for unknown WhatsApp recipients', () => {
  assert.equal(originAllowed(local, 'http://localhost:3100/api/backoffice/whatsapp/999000000000', 'POST', env), false);
});
test('rejects fallback for production, Vercel preview and production Neon', () => {
  for (const changes of [
    {NODE_ENV:'production'}, {VERCEL_ENV:'preview'}, {VERCEL_ENV:'production'},
    {DATABASE_URL:'postgresql://u:p@ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech/neondb'},
  ]) assert.equal(originAllowed(local,'http://localhost:3100'+path,'POST',{...env,...changes}),false);
});
test('fallback needs complete private local configuration and exact NEXTAUTH_URL', () => {
  for(const key of ['NEXTAUTH_URL','DBK36_TEST_WEBHOOK_BYPASS','DBK36_TEST_READ_ONLY_STAFF_AUTH','SANITY_API_READ_TOKEN','WHATSAPP_TEST_RECIPIENTS'])
    assert.equal(originAllowed(local,'http://localhost:3100'+path,'POST',{...env,[key]:undefined}),false,key);
  assert.equal(originAllowed(local,'http://localhost:3100'+path,'POST',{...env,SANITY_API_WRITE_TOKEN:'write'}),false);
});
test('POST handler still enforces ADMIN, origin, valid action and WhatsApp mode', () => {
  const source=readFileSync(new URL('../app/api/backoffice/whatsapp/[waId]/route.ts',import.meta.url),'utf8');
  assert.match(source,/getApiStaff\(\['ADMIN'\]\)/);
  assert.match(source,/if \(!sameOrigin\(request\)\)/);
  assert.match(source,/isPermittedWhatsAppStaffOrigin/);
  assert.match(source,/if \(body\.action === 'mode'/);
  assert.match(source,/isHumanConversation\(waId\)/);
});
test('production maintenance barrier remains unchanged', () => {
  const proxy=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
  assert.match(proxy,/allowLocalWhatsAppStaffTestPost\(request\.method, pathname, process\.env\)/);
  assert.match(proxy,/DBK74_UNAVAILABLE/);
});
