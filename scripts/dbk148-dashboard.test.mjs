import test from 'node:test';
import assert from 'node:assert/strict';
import { dbk148DashboardOrders } from '../lib/operations/dbk148-dashboard-core.ts';
const row = (id, overrides={}) => ({ id, orderNumber:id, paymentStatus:'paid', status:'processing', salesChannel:'ONLINE', subtotal:100, discountAmount:10, createdAt:'2026-11-24T12:00:00Z', ...overrides });
test('counts paid merchandise across stores and providers, excludes unpaid and POS from online queue', () => {
  const r = dbk148DashboardOrders([row('old'), row('abandoned',{paymentStatus:'pending'}), row('pos',{salesChannel:'POS'})], [row('new',{subtotal:250,discountAmount:0,createdAt:'2026-11-25T12:00:00Z'}), row('delivered',{status:'delivered'})]);
  assert.equal(r.revenue,520); assert.equal(r.openOrders,2); assert.equal(r.recent[0].id,'new'); assert.equal(r.recent.length,4);
});
test('authoritative Neon duplicate reference replaces historical projection', () => {
  const r = dbk148DashboardOrders([row('old',{paymentReference:'P1'})],[row('new',{paymentReference:'P1',subtotal:200})]);
  assert.equal(r.revenue,190); assert.equal(r.openOrders,1); assert.equal(r.recent[0].id,'new');
});
test('duplicate Neon IDs or payment references fail closed', () => {
  assert.throws(()=>dbk148DashboardOrders([], [row('one'),row('one')]));
  assert.throws(()=>dbk148DashboardOrders([], [row('one',{paymentReference:'P1'}),row('two',{paymentReference:'P1'})]));
});
test('recent list capped at five; totals include every paid row', () => {
  const r=dbk148DashboardOrders(Array.from({length:8},(_,i)=>row(String(i))),[]);
  assert.equal(r.recent.length,5); assert.equal(r.revenue,720); assert.equal(r.openOrders,8);
});
