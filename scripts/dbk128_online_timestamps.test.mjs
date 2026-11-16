import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Execute the REAL TS mapper through a local TypeScript transpilation so the
// regression test catches a Date value surviving into .localeCompare.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync('lib/db/dbk65-online-fulfilment-core.ts', 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(js, { exports, Date, Number, String, RegExp, Error, Array, console },
  { filename: 'dbk65-online-fulfilment-core.ts' });
const { mapNeonOrder, mapNeonShipment } = exports;

function row(overrides = {}) {
  const reference = 'DBK64-1794735910615-b6361e4ea5';
  return {
    order_id: `dbk64.order.${reference}`,
    reference,
    order_number: 'DBK-COM-1794735910615-8a2a30f8',
    store_id: 'storeLocation.4fcbd28b74494e7da7176525e63d73f4',
    amount_minor: '215000', payment_status: 'PAID', stock_status: 'COMMITTED',
    provider_transaction_id: '6765857912',
    created_at: new Date('2026-11-15T09:45:10.663Z'),
    updated_at: new Date('2026-11-15T09:45:57.000Z'),
    paid_at: new Date('2026-11-15T09:45:57.000Z'),
    fulfilment_status: null, fulfilment_updated_at: null,
    dispatched_at: null, dispatched_by_name: null, delivered_at: null,
    snapshot: {
      orderId: `dbk64.order.${reference}`, reference,
      orderNumber: 'DBK-COM-1794735910615-8a2a30f8',
      storeId: 'storeLocation.4fcbd28b74494e7da7176525e63d73f4',
      storeName: 'OTC Mall Branch', customerName: 'Ayaan Amine',
      customerEmail: 'ayaanamine@gmail.com', customerPhone: '0759680762',
      deliveryLocation: 'Nairobi', deliveryAddress: null,
      paymentChannel: 'mobile_money', subtotalMinor: '215000',
      deliveryMinor: '0', totalMinor: '215000', lines: [],
    },
    ...overrides,
  };
}

test('DBK128: Date objects from Neon become ISO strings and sort with Sanity', () => {
  const order = mapNeonOrder(row());
  assert.equal(order.createdAt, '2026-11-15T09:45:10.663Z');
  assert.equal(order.updatedAt, '2026-11-15T09:45:57.000Z');
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.total, 2150);
  assert.doesNotThrow(() => [
    { createdAt: '2026-11-14T00:00:00.000Z' }, order,
  ].sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
});

test('DBK128: shipment timestamps and delivery timestamps remain strings', () => {
  const r = row({
    fulfilment_updated_at: new Date('2026-11-15T10:00:00Z'),
    dispatched_at: new Date('2026-11-15T10:02:00Z'),
  });
  const order=mapNeonOrder(r);
  const shipment=mapNeonShipment(r);
  assert.equal(order.updatedAt,'2026-11-15T10:00:00.000Z');
  assert.equal(order.dispatchedAt,'2026-11-15T10:02:00.000Z');
  assert.equal(shipment?.createdAt,'2026-11-15T09:45:10.663Z');
  assert.equal(typeof shipment?.updatedAt,'string');
});

test('DBK128: existing ISO input remains valid', () => {
  const order = mapNeonOrder(row({
    created_at: '2026-11-15T09:45:10.663Z',
    updated_at: '2026-11-15T09:45:57.000Z',
  }));
  assert.equal(order.createdAt,'2026-11-15T09:45:10.663Z');
});

test('DBK128: invalid timestamps fail rather than making up an order time', () => {
  assert.throws(() => mapNeonOrder(row({created_at: new Date('invalid')})),
    /Invalid Neon online created_at/);
});
