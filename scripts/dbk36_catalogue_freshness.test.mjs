import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCatalogueFreshness } from '../lib/whatsapp/catalogue-freshness.ts';
const time = Date.parse('2026-11-05T00:43:57+03:00');
const minutes = (number) => time + number * 60_000;

test('fresh catalog remains fresh for the first 60 minutes', () => {
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(60)), 'fresh');
});

test('the 64-minute-old test cache remains browsable with a warning', () => {
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(64)), 'stale');
});

test('bounded grace period ends after 7 hours with default configuration', () => {
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(420)), 'stale');
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(421)), 'expired');
});

test('invalid/future dates and disabled grace fail closed', () => {
  assert.equal(classifyCatalogueFreshness('bad', minutes(10)), 'expired');
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), time - 120_000), 'expired');
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(61), 60, 0), 'expired');
});

test('grace never exceeds 24 hours even with excessive settings', () => {
  assert.equal(classifyCatalogueFreshness(new Date(time).toISOString(), minutes(1441), 1200, 500), 'expired');
});
