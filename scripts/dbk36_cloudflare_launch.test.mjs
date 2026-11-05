import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDecision, cronTarget, isVerifiedCloudflareRuntime } from '../cloudflare/dbk36-gateway-policy.mjs';
import { isProductionRuntime, isAllowedWhatsAppRecipient, isProductionMetaWebhookApproved } from '../lib/whatsapp/production-policy.ts';

const db = 'postgresql://nobody:example@ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech/neondb';
const env = {
  NODE_ENV: 'production', DBK36_CLOUDFLARE_DEPLOYMENT: 'YES', DATABASE_URL: db,
  WHATSAPP_PHONE_NUMBER_ID: '1234567890', DBK36_PRODUCTION_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_BOT_ENABLED: 'YES', DBK36_PRODUCTION_WEBHOOK_ENABLED: 'YES',
  DBK36_PRODUCTION_PILOT_ENABLED: 'YES', WHATSAPP_TEST_RECIPIENTS: '254700000000',
  DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED: 'YES', DBK36_SANITY_WEBHOOK_ENABLED: 'YES',
  DBK36_SANITY_WEBHOOK_SECRET: 'x'.repeat(40), WHATSAPP_WORKER_SECRET: 'y'.repeat(40),
};

test('Cloudflare runtime retains exact DBK-74 production database identity', () => {
  assert.equal(isVerifiedCloudflareRuntime(env), true);
  assert.equal(isProductionRuntime(env), true);
  assert.equal(isProductionRuntime({ ...env, DATABASE_URL: db.replace('/neondb', '/other') }), false);
  assert.equal(isVerifiedCloudflareRuntime({ ...env, VERCEL_ENV: 'production' }), false);
  assert.equal(isProductionRuntime({ ...env, DBK36_TEST_WEBHOOK_BYPASS: 'YES' }), false);
});

test('Cloudflare entry exposes ONLY signed webhook routes, never POS/checkout/auth/admin/assets', () => {
  assert.equal(routeDecision('GET', '/api/whatsapp/webhook', env), 'allow');
  assert.equal(routeDecision('POST', '/api/whatsapp/webhook', env), 'allow');
  assert.equal(routeDecision('POST', '/api/whatsapp/catalogue/event', env), 'allow');
  for (const [method, path] of [
    ['GET','/'], ['GET','/_next/static/chunks/app.js'], ['GET','/admin/whatsapp'],
    ['POST','/api/backoffice/pos/sale'], ['POST','/api/paystack/initialize'],
    ['GET','/api/whatsapp/process'], ['GET','/api/whatsapp/catalogue/sync'],
    ['POST','/api/whatsapp/catalogue/sync'], ['POST','/api/auth/callback/google'],
    ['GET','/studio'], ['GET','/api/debug/product/test'],
  ]) assert.equal(routeDecision(method, path, env), 'deny', `${method} ${path}`);
});

test('no credential or production gate means no public webhook', () => {
  for (const delta of [
    { DBK36_PRODUCTION_WEBHOOK_ENABLED: 'NO' },
    { DBK36_CLOUDFLARE_DEPLOYMENT: 'NO' },
    { WHATSAPP_PHONE_NUMBER_ID: '1234567891' },
    { DATABASE_URL: 'postgresql://other@example.com/neondb' },
  ]) assert.equal(routeDecision('POST', '/api/whatsapp/webhook', { ...env, ...delta }), 'deny');
  assert.equal(routeDecision('GET', '/__dbk36/health', {}), 'health');
});

test('pilot permits only configured recipients; never makes public sends', () => {
  assert.equal(isProductionMetaWebhookApproved(env), true);
  assert.equal(isAllowedWhatsAppRecipient('254700000000', env), true);
  assert.equal(isAllowedWhatsAppRecipient('254711111111', env), false);
  assert.equal(isAllowedWhatsAppRecipient('254711111111', {
    ...env, DBK36_PRODUCTION_SENDING_APPROVED: 'YES', DBK36_PRODUCTION_LAUNCH_APPROVED: 'NO',
  }), false);
});

test('Cron targets are internal and only activate behind gates', () => {
  assert.equal(cronTarget('*/5 * * * *', env), '/api/whatsapp/process');
  assert.equal(cronTarget('*/30 * * * *', env), '/api/whatsapp/catalogue/sync');
  assert.equal(cronTarget('*/5 * * * *', { ...env, WHATSAPP_BOT_ENABLED: 'NO' }), null);
  assert.equal(cronTarget('*/30 * * * *', { ...env, DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED: 'NO' }), null);
  assert.equal(cronTarget('*/5 * * * *', { ...env, DATABASE_URL: undefined }), null);
  assert.equal(cronTarget('* * * * *', env), null);
});
