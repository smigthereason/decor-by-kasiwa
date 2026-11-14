import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dbk109NeonAuthorityRequested,
  dbk109LegacyInventoryWriteBlocked,
} from '../lib/db/dbk109-cutover-authority.ts';

const source = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('DBK109 never routes historical stock writes to Sanity when a live Neon channel is requested', () => {
  assert.equal(dbk109NeonAuthorityRequested({}), false);
  assert.equal(dbk109LegacyInventoryWriteBlocked({}), false);
  const switches = [
    ['DBK101_POS_NEON_REQUIRED', 'YES'],
    ['DBK102_OPERATIONAL_NEON_ONLY', 'YES'],
    ['DBK62_POS_BACKEND', 'neon'],
    ['DBK68_MPESA_BACKEND', 'neon'],
    ['DBK64_ONLINE_BACKEND', 'neon'],
    ['DBK_INVENTORY_BACKEND', 'neon'],
  ];
  for (const [name, value] of switches) {
    const config = { [name]: value };
    assert.equal(dbk109NeonAuthorityRequested(config), true, name);
    assert.equal(dbk109LegacyInventoryWriteBlocked(config), name !== 'DBK_INVENTORY_BACKEND', name);
    assert.equal(dbk109LegacyInventoryWriteBlocked({ ...config, DBK_INVENTORY_BACKEND: 'neon' }), false);
  }
  assert.equal(dbk109NeonAuthorityRequested({ DBK62_POS_BACKEND: 'sanity', DBK64_ONLINE_BACKEND: 'sanity' }), false);
});

test('all three stock movement mutators reject split-authority fallback', () => {
  const route=source('../app/api/backoffice/inventory/movements/route.ts');
  assert.equal((route.match(/if \(dbk109LegacyInventoryWriteBlocked\(\)\)/g)||[]).length,3);
  assert.match(route,/if \(dbk69InventoryEnabled\(\)\) \{/);
  assert.match(route,/dbk69ApplyAdminOperation\(/);
});

test('product create and product edit cannot mutate legacy quantities under any cutover channel', () => {
  const create=source('../app/api/backoffice/products/route.ts');
  const edit=source('../app/api/backoffice/products/[id]/route.ts');
  assert.match(create,/dbk109LegacyInventoryWriteBlocked\(\)/);
  assert.equal((edit.match(/dbk109LegacyInventoryWriteBlocked\(\)/g)||[]).length,2);
});

test('POS and online checkout fail closed on partial channel activation', () => {
  assert.match(source('../app/api/backoffice/pos/sale/route.ts'),
    /dbk109NeonAuthorityRequested\(\) && !dbk62CutoverRequested\(\)/);
  assert.match(source('../lib/paystack/server.ts'),
    /!neonCheckout && dbk109NeonAuthorityRequested\(\)/);
  assert.match(source('../app/api/backoffice/pos/receivables/route.ts'),
    /dbk109NeonAuthorityRequested\(\) && !dbk62CutoverRequested\(\)/);
  assert.match(source('../app/api/backoffice/pos/refunds/route.ts'),
    /dbk109NeonAuthorityRequested\(\) && !dbk62CutoverRequested\(\)/);
});

test('WhatsApp staff-approved stock commits cannot fall back to Sanity', () => {
  const route=source('../lib/db/dbk36-fulfillment.ts');
  assert.match(route,/if\(dbk109NeonAuthorityRequested\(\)\)/);
  assert.match(route,/dbk103_commit_verified_wa_stock/);
});

test('inventory is pinned to immutable production host and database', () => {
  const route=source('../lib/db/dbk69-inventory-neon.ts');
  assert.match(route,/host !== productionHost \|\| expected !== productionHost/);
  assert.match(route,/decodeURIComponent\(u.pathname.slice\(1\)\) !== 'neondb'/);
});

test('DBK-74 maintenance actually pauses new POS, Paystack, finance and inventory writes',()=>{
  const routes=[
    '../app/api/backoffice/pos/sale/route.ts',
    '../app/api/paystack/initialize/route.ts',
    '../app/api/backoffice/inventory/movements/route.ts',
    '../app/api/backoffice/products/route.ts',
    '../app/api/backoffice/products/[id]/route.ts',
    '../app/api/backoffice/pos/receivables/route.ts',
    '../app/api/backoffice/pos/refunds/route.ts',
  ];
  for(const route of routes) {
    const s=source(route);
    assert.match(s,/dbk109MaintenanceDecision\(\)/,route);
    assert.match(s,/DBK109_CUTOVER_FREEZE/,route);
  }
  assert.match(source('../lib/db/dbk36-fulfillment.ts'),/dbk109MaintenanceDecision\(\)/);
  const guard=source('../lib/db/dbk109-maintenance.ts');
  assert.match(guard,/SELECT active FROM public\.dbk74_freeze_control/);
  assert.match(guard,/hostname !== PRODUCTION_HOST/);
  // Provider callbacks MUST remain allowed to reconcile a payment already sent.
  assert.doesNotMatch(source('../app/api/payments/mobile/callback/route.ts'),/dbk109MaintenanceDecision/);
  assert.doesNotMatch(source('../app/api/paystack/webhook/route.ts'),/dbk109MaintenanceDecision/);
});

test('DBK109 freeze script is opt-in, production-pinned, and cannot enable financial gates',()=>{
  const s=source('./dbk109_manage_freeze.mjs');
  assert.match(s,/--confirm-production-maintenance/);
  assert.match(s,/--status/);
  assert.match(s,/dbk74_freeze_control/);
  assert.match(s,/pending_callbacks/);
  assert.doesNotMatch(s,/UPDATE public\.dbk68_daraja_config|UPDATE public\.dbk62_cutover_config/);
});
