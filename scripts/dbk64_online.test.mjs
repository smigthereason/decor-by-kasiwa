import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbk64MoneyMinor, dbk64ValidReference, dbk64VerifiedOrder } from '../lib/db/dbk64-online-core.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('lib/paystack/server.ts');
const core = read('lib/db/dbk64-online-neon.ts');
const sql = read('migration/dbk64-online-paystack.sql');
const admin = read('app/api/backoffice/orders/online-neon/route.ts');

test('KES value conversion accepts exact cents and rejects fractional minor units', () => {
  assert.equal(dbk64MoneyMinor(200), 20000);
  assert.equal(dbk64MoneyMinor(199.99), 19999);
  for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.001, 10000000001]) {
    assert.throws(() => dbk64MoneyMinor(invalid));
  }
});

test('dedicated Paystack references cannot overlap original Sanity references', () => {
  assert.equal(dbk64ValidReference('DBK64-1793190000000-a123456789'), true);
  assert.equal(dbk64ValidReference('DBK-POS-1234'), false);
  assert.equal(dbk64ValidReference('DBK-123-abcdef1234'), false);
  assert.equal(dbk64ValidReference('DBK64-1793190000000-INVALIDXYZ'), false);
});

test('verified order maps minor units and customer data for checkout success', () => {
  const mapped = dbk64VerifiedOrder({ orderId:'dbk64.order.DBK64-1793190000000-a123456789',
    orderNumber:'DBK-COM-1793190000000-1234abcd',reference:'DBK64-1793190000000-a123456789',
    customerName:'Customer',customerEmail:'test@example.com',customerPhone:'0700000000',
    paymentChannel:'Card',subtotalMinor:20000,deliveryMinor:2500,totalMinor:22500,
    deliveryAddress:{fullName:'Customer',phone:'0700000000',address1:'Main',city:'Nairobi',region:'Nairobi',country:'Kenya'},
    lines:[{productId:'p1',variantId:'',quantity:1,unitPriceMinor:20000,name:'Item'}] });
  assert.equal(mapped.total, 225);
  assert.equal(mapped.deliveryFee, 25);
  assert.equal(mapped.items[0].unitPrice, 200);
  assert.equal(mapped.orderNumber,'DBK-COM-1793190000000-1234abcd');
});

test('new Neon checkout refuses Sanity fallback and avoids Sanity order-counter mutation', () => {
  assert.match(app, /if \(!neonCheckout && process\.env\.DBK62_POS_BACKEND === 'neon'\)/);
  assert.match(app, /neonCheckout\s*\? `DBK-COM-/);
  assert.match(app, /await dbk64CreatePending\(snapshot\)/);
  assert.ok(app.indexOf('await dbk64CreatePending(snapshot)') < app.indexOf('await serverClient.create({\n    _id: orderId'));
});

test('new Neon checkout validates Paystack authorization response and never trusts client prices', () => {
  assert.match(app, /buildAuthoritativeOrderLines\(cart\)/);
  assert.match(app, /provider\.data\.reference !== reference/);
  assert.match(app, /amount: String\(snapshot\.totalMinor\)/);
});

test('the same provider reference always returns through Neon verification, never Sanity', () => {
  assert.match(app, /if \(reference\.startsWith\("DBK64-"\)\)/);
  assert.match(app, /const payment = await verifyWithPaystack\(reference\)/);
  assert.match(app, /payment\.reference !== reference \|\| payment\.currency !== CURRENCY/);
  assert.match(app, /payment\.amount !== Number\(order\.amount_minor\)/);
  assert.match(app, /await dbk64RecordVerifiedPayment/);
});

test('pending payment settlement can continue when new checkout creation is halted', () => {
  assert.match(core, /DBK64_ONLINE_SETTLEMENT === 'YES'/);
  assert.match(core, /getSql\('settle'\)/);
  assert.match(core, /DBK64_CUTOVER_APPROVED/);
  assert.match(core, /dbk62GetProductionSql\(\)/);
});

test('new database schema defaults disabled and requires prior full cutover approval', () => {
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /c\.sanity_stock_frozen AND c\.all_stock_writers_switched/);
  assert.match(sql, /c\.provider_callbacks_ready AND c\.receivables_ready/);
  assert.match(sql, /c\.refunds_ready AND c\.reports_ready/);
  assert.match(sql, /c\.reconciliation_fingerprint=s\.seed_fingerprint/);
});

test('paid financial status survives failure to deduct stock', () => {
  assert.match(sql, /dbk55_record_paid_pos/);
  assert.match(sql, /'COMMITTED','REVIEW_REQUIRED'/);
  assert.match(sql, /payment_status='PAID'/);
  assert.match(app, /stockStatus === "REVIEW_REQUIRED"/);
});

test('the same verified provider transaction cannot settle two orders', () => {
  assert.match(sql, /provider_transaction_id text UNIQUE/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Conflicting DBK-64 paid-order replay/);
});

test('operations readback is admin-only and never publicly cached', () => {
  assert.match(admin, /getApiStaff\(\['ADMIN'\]\)/);
  assert.match(admin, /private, no-store/);
  assert.match(core, /dbk64ListOperationalOrders/);
});

test('the existing webhook retains signature verification and passes online references to finalizer', () => {
  const webhook=read('app/api/paystack/webhook/route.ts');
  assert.match(webhook, /verifyPaystackWebhookSignature\(rawBody, signature\)/);
  assert.match(webhook, /await finalizePaystackPayment\(reference\)/);
  assert.match(webhook, /status: 500/);
});
