import test from 'node:test';
import assert from 'node:assert/strict';
import { getSafeTestConfig, parseAction } from './dbk36_resume_test_bot.mjs';
const testEnv = {
  DATABASE_URL: 'postgresql://user:password@ep-sample-branch-123.us-east-2.aws.neon.tech/neondb',
  WHATSAPP_TEST_RECIPIENTS: '+254700111222, 254700333444',
};

test('accepts a separate Neon test endpoint and approved recipients', () => {
  assert.deepEqual(getSafeTestConfig(testEnv).recipients, ['254700111222', '254700333444']);
});
test('rejects missing connection', () => {
  assert.throws(() => getSafeTestConfig({ WHATSAPP_TEST_RECIPIENTS: '+254700111222' }), /DATABASE_URL/);
});
test('rejects a known production endpoint', () => {
  assert.throws(() => getSafeTestConfig({ ...testEnv, DATABASE_URL: 'postgresql://user:pw@ep-steep-scene-bausr4ct.us-east-2.aws.neon.tech/neondb' }), /STOP/);
});
test('rejects an arbitrary PostgreSQL host', () => {
  assert.throws(() => getSafeTestConfig({ ...testEnv, DATABASE_URL: 'postgresql://user:pw@host.example.com/neondb' }), /STOP/);
});
test('rejects production configuration', () => {
  assert.throws(() => getSafeTestConfig({ ...testEnv, NODE_ENV: 'production' }), /production/);
});
test('rejects missing test-recipient allowlist', () => {
  assert.throws(() => getSafeTestConfig({ DATABASE_URL: testEnv.DATABASE_URL }), /test recipient/);
});
test('lists without changing anything', () => {
  assert.deepEqual(parseAction(['--list'], ['254700111222']), { action: 'list' });
});
test('requires explicit confirmation and allowlisted recipient', () => {
  assert.deepEqual(parseAction(['--resume=254700111222', '--confirm-test-only'], ['254700111222']), { action: 'resume', waId: '254700111222' });
  assert.throws(() => parseAction(['--resume=254700111222'], ['254700111222']), /--confirm-test-only/);
  assert.throws(() => parseAction(['--resume=254700111333', '--confirm-test-only'], ['254700111222']), /STOP/);
});
