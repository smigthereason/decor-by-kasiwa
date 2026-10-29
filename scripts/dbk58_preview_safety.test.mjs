import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const route = readFileSync(join(root,'app/api/backoffice/pos/neon-preview/route.ts'),'utf8');
const server = readFileSync(join(root,'lib/pos/server.ts'),'utf8');
const sale = readFileSync(join(root,'app/api/backoffice/pos/sale/route.ts'),'utf8');
const preview = server.slice(server.indexOf('export async function previewDBK58ManualPosSale'));

test('preview route requires local development flag and does not expose a GET or write path', () => {
  assert.match(route, /process\.env\.NODE_ENV !== "development"/);
  assert.match(route, /process\.env\.DBK58_LOCAL_PREVIEW !== "YES"/);
  assert.doesNotMatch(route, /export async function GET/);
  assert.doesNotMatch(route, /recordTestNeonManualPosSale|dbk57_record_manual_sale|\.transaction\(|\.create\(|\.patch\(|\.delete\(/);
});
test('preview route checks active ADMIN identity before considering the request', () => {
  assert.match(route, /getApiStaff\(\["ADMIN"\]\)/);
  assert.match(route, /getApiStaff\(\["ADMIN"\]\)[\s\S]*if \(!staff\.ok\)/);
  assert.match(route, /origin !== new URL\(request\.url\)\.origin/);
  assert.match(route, /application\/json/);
});
test('preview route verifies live active store with no-store fetch', () => {
  assert.match(route, /_type == "storeLocation" && _id == \$id && active != false/);
  assert.match(route, /cache: "no-store"/);
});
test('preview reuses actual live server-side stock and price validation, no client-provided prices', () => {
  assert.match(preview, /await buildLines\(input\.cart, seller\)/);
  assert.match(preview, /subtotalFor\(lines\)/);
  assert.match(preview, /calculateDiscount\(subtotal, input\.discount, seller\)/);
  assert.match(preview, /deliveryPayable\(input\)/);
  assert.match(preview, /toCents\(line\.unitPrice/);
  assert.doesNotMatch(preview, /input\.unitPrice|input\.amountPaid|input\.balanceDue/);
});
test('synthetic references are required and preview is never financial proof', () => {
  assert.match(preview, /DBK58-TEST-\[A-Z0-9-\]/);
  assert.match(preview, /simulatedPayment: true/);
  assert.match(preview, /noWritesPerformed: true/);
  assert.match(preview, /input\.manualPaymentConfirmed !== true/);
});
test('partial and excess receipts demand cashier acknowledgments', () => {
  assert.match(preview, /breakdown\.balanceDue > 0 && input\.manualPartialPaymentConfirmed !== true/);
  assert.match(preview, /breakdown\.overpaidAmount > 0 && input\.manualOverpaymentConfirmed !== true/);
});
test('existing production POS route still routes manual sale to Sanity workflow', () => {
  assert.match(sale, /await createPosManualSale\(body, seller\)/);
  assert.doesNotMatch(sale, /DBK58|previewDBK58|recordTestNeonManualPosSale/);
});
test('preview returns contract-shaped exact integer minor-unit amounts', () => {
  for(const p of ['requestKey','cashierConfirmed','discountMinor','deliveryMinor','unitPriceMinor','amountMinor','balanceDueMinor','overpaidMinor']) assert.ok(preview.includes(p),p);
  assert.match(preview, /manualPaymentBreakdown\(calculatedTotal, requestedPayment\)/);
});
