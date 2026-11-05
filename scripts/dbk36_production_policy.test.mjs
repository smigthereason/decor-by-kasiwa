import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isProductionDatabase, isProductionRuntime, isLiveSendingApproved,
  isAllowedWhatsAppRecipient, isProductionSyncApproved,
  isProductionMetaWebhookApproved, isProductionSanityWebhookApproved,
  allowProductionDbk36WebhookPost,
} from '../lib/whatsapp/production-policy.ts';

const url='postgresql://test:secret@ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech/neondb';
const prod={NODE_ENV:'production',VERCEL_ENV:'production',DATABASE_URL:url,
  DBK36_PRODUCTION_PHONE_NUMBER_ID:'1234567890',WHATSAPP_PHONE_NUMBER_ID:'1234567890',
  WHATSAPP_BOT_ENABLED:'YES',WHATSAPP_TEST_RECIPIENTS:'254700000000',
  DBK36_PRODUCTION_SENDING_APPROVED:'YES',DBK36_PRODUCTION_LAUNCH_APPROVED:'YES',
  DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED:'YES', DBK36_PRODUCTION_WEBHOOK_ENABLED:'YES',
  DBK36_SANITY_WEBHOOK_ENABLED:'YES',DBK36_SANITY_WEBHOOK_SECRET:'z'.repeat(40)};
const nonProdDatabase='postgresql://test:secret@ep-test-unit-pooler.c-8.eu-central-1.aws.neon.tech/neondb';

test('database guard matches exact DBK-74 production identity',()=>{
  assert.ok(isProductionDatabase(url));
  assert.equal(isProductionDatabase(nonProdDatabase),false);
  assert.equal(isProductionDatabase(url.replace('/neondb','/other')),false);
  assert.equal(isProductionDatabase('postgresql://localhost/neondb'),false);
});

test('public sending never activates without two explicit approvals',()=>{
  assert.ok(isLiveSendingApproved(prod));
  for(const flag of ['DBK36_PRODUCTION_SENDING_APPROVED','DBK36_PRODUCTION_LAUNCH_APPROVED']) {
    assert.equal(isLiveSendingApproved({...prod,[flag]:'NO'}),false);
    assert.equal(isAllowedWhatsAppRecipient('254711111111',{...prod,[flag]:'NO'}),false);
  }
});

test('production phone must be the explicitly approved phone ID',()=>{
  assert.equal(isAllowedWhatsAppRecipient('254711111111',{...prod,DBK36_PRODUCTION_PHONE_NUMBER_ID:'different'}),false);
  assert.equal(isAllowedWhatsAppRecipient('254711111111',{...prod,DATABASE_URL:nonProdDatabase}),false);
  assert.equal(isAllowedWhatsAppRecipient('254711111111',{...prod,VERCEL_ENV:'preview'}),false);
  assert.equal(isAllowedWhatsAppRecipient('254711111111',{...prod,DBK36_TEST_WEBHOOK_BYPASS:'YES'}),false);
  assert.equal(isAllowedWhatsAppRecipient('254711111111',prod),true);
  assert.equal(isAllowedWhatsAppRecipient('not-a-phone',prod),false);
});

test('allowlist remains mandatory in development and preview',()=>{
  assert.equal(isAllowedWhatsAppRecipient('254711111111',{
    ...prod,NODE_ENV:'development',VERCEL_ENV:undefined,WHATSAPP_TEST_RECIPIENTS:'254700000000'}),false);
  assert.equal(isAllowedWhatsAppRecipient('254700000000',{
    ...prod,NODE_ENV:'development',VERCEL_ENV:undefined}),true);
});

test('production pilot sends only to approved test recipients',()=>{
  const pilot={...prod,DBK36_PRODUCTION_SENDING_APPROVED:'NO',DBK36_PRODUCTION_PILOT_ENABLED:'YES'};
  assert.equal(isAllowedWhatsAppRecipient('254700000000',pilot),true);
  assert.equal(isAllowedWhatsAppRecipient('254711111111',pilot),false);
});

test('catalogue sync and webhook routes require exact production environment and separate gates',()=>{
  assert.ok(isProductionRuntime(prod));
  assert.ok(isProductionSyncApproved(prod));
  assert.ok(isProductionMetaWebhookApproved(prod));
  assert.ok(isProductionSanityWebhookApproved(prod));
  for(const flag of ['DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED','DBK36_SANITY_WEBHOOK_ENABLED']) {
    assert.equal(isProductionSanityWebhookApproved({...prod,[flag]:'NO'}),false);
  }
  assert.equal(isProductionSanityWebhookApproved({...prod,DBK36_SANITY_WEBHOOK_SECRET:'short'}),false);
});

test('DBK-74 bypass is only for exact two signed webhook route handlers',()=>{
  assert.ok(allowProductionDbk36WebhookPost('POST','/api/whatsapp/webhook',prod));
  assert.ok(allowProductionDbk36WebhookPost('POST','/api/whatsapp/catalogue/event',prod));
  for (const route of ['/api/whatsapp/catalogue/sync','/api/backoffice/whatsapp/254700000000',
    '/api/checkout','/api/stock','/api/whatsapp/process']) {
    assert.equal(allowProductionDbk36WebhookPost('POST',route,prod),false);
  }
  assert.equal(allowProductionDbk36WebhookPost('GET','/api/whatsapp/webhook',prod),false);
  assert.equal(allowProductionDbk36WebhookPost('POST','/api/whatsapp/webhook',{...prod,DBK36_PRODUCTION_WEBHOOK_ENABLED:'NO'}),false);
});

test('source production endpoints preserve authentication and signature checks',()=>{
  const root=new URL('../',import.meta.url);
  const src=(s)=>readFileSync(new URL(s,root),'utf8');
  assert.match(src('app/api/whatsapp/catalogue/sync/route.ts'),/safeMatch\(request\.headers\.get\('authorization'\)/);
  assert.match(src('app/api/whatsapp/catalogue/sync/route.ts'),/isProductionSyncApproved\(process\.env\)/);
  assert.match(src('app/api/whatsapp/catalogue/event/route.ts'),/parseBody\(request, process\.env\.DBK36_SANITY_WEBHOOK_SECRET, true\)/);
  assert.match(src('app/api/whatsapp/webhook/route.ts'),/verifyMetaSignature/);
  assert.match(src('lib/whatsapp/processor.ts'),/isAllowedWhatsAppRecipient\(to, process\.env\)/);
  assert.match(src('proxy.ts'),/allowProductionDbk36WebhookPost/);
  assert.match(src('proxy.ts'),/database identity mismatch/);
});
