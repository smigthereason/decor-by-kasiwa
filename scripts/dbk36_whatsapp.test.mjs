import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  safeMatch, verifyMetaSignature, parseIncomingMessages, wantsHuman,
  productSearchTerms,
} from '../lib/whatsapp/core.ts';

const secret = 'an-app-secret-for-test-only';
test('Meta webhook GET token comparison rejects missing or mismatched values', () => {
  assert.equal(safeMatch('abc', 'abc'), true);
  assert.equal(safeMatch('', ''), false);
  assert.equal(safeMatch('abc', 'def'), false);
  assert.equal(safeMatch('abc', 'longer'), false);
  assert.equal(safeMatch(null, 'abc'), false);
});
test('signature verification authenticates raw exact bytes', () => {
  const payload = '{"object":"whatsapp_business_account"}';
  const sig = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  assert.equal(verifyMetaSignature(payload, sig, secret), true);
  assert.equal(verifyMetaSignature(`${payload}\n`, sig, secret), false);
  assert.equal(verifyMetaSignature(payload, sig, 'wrong'), false);
  assert.equal(verifyMetaSignature(payload, 'sha256=abcd', secret), false);
  assert.equal(verifyMetaSignature(payload, null, secret), false);
});
const sample = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
  metadata: { phone_number_id: '123' }, contacts: [{ wa_id: '254700111222', profile: { name: 'Buyer A' } }],
  messages: [
    { id: 'wamid.T1', from: '254700111222', type: 'text', text: { body: 'Show me lamps' }, timestamp: '1793600000' },
    { id: 'wamid.T2', from: '254700111222', type: 'image', image: { id: 'media123', caption: 'Custom cushion' } },
    { id: 'wamid.T3', from: '254700111222', type: 'interactive' },
  ],
  statuses: [{ id: 'wamid.outbound', status: 'delivered' }],
}}] }] };
test('parse incoming text, photo and unsupported without treating delivery receipts as inbound', () => {
  const messages = parseIncomingMessages(sample, '123');
  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(m => m.type), ['text','image','unsupported']);
  assert.equal(messages[0].text, 'Show me lamps');
  assert.equal(messages[0].displayName, 'Buyer A');
  assert.equal(messages[1].mediaId, 'media123');
  assert.equal(messages[2].text, '');
});
test('ignore messages sent to other WhatsApp numbers', () => {
  assert.deepEqual(parseIncomingMessages(sample, '456'), []);
  assert.deepEqual(parseIncomingMessages({ object: 'not-whatsapp', entry: sample.entry }, '123'), []);
  assert.deepEqual(parseIncomingMessages({ object: 'whatsapp_business_account', entry: [] }, '123'), []);
});
test('human handover and product terms are deterministic', () => {
  assert.equal(wantsHuman('Can I talk to a real person?'), true);
  assert.equal(wantsHuman('Show me cushions'), false);
  assert.deepEqual(productSearchTerms('Please show me mirrors and mirrors'), ['mirrors']);
});

import {
  classifySalesIntent, isHandoverRequest, findCatalogueProducts,
  productReply, deliveryReply, fixedReply, salesMenu,
} from '../lib/whatsapp/rules.ts';

const products = [
  { id: 'mirror', slug: 'arched-mirror', name: 'Arched Mirror', category: 'Mirrors', description: 'Wall mirror for the home', price: 4000, stockQuantity: 4, featured: true },
  { id: 'cushion', slug: 'cushion', name: 'Cushion Cover', category: 'Soft Furnishings', description: 'Cosy cushions', price: 750, stockQuantity: 12 },
  { id: 'soldout', slug: 'soldout-lamp', name: 'Gold Lamp', category: 'Lighting', description: 'Lamp', price: 1800, stockQuantity: 0 },
  { id: 'hidden', slug: 'hidden-mirror', name: 'Hidden Mirror', category: 'Mirrors', description: 'Mirror', price: 500, stockQuantity: 2, ecommerceEnabled: false },
  { id: 'no-price', slug: 'unpriced-mirror', name: 'Unpriced Mirror', category: 'Mirrors', description: 'Mirror', price: 0, stockQuantity: 2 },
];
const site = 'https://www.decorbykasiwa.co.ke';

test('rule engine shows menu and supports numbered navigation without AI', () => {
  assert.equal(classifySalesIntent('Hi'), 'menu');
  assert.equal(classifySalesIntent('MENU'), 'menu');
  assert.equal(classifySalesIntent('1'), 'browse');
  assert.equal(classifySalesIntent('2'), 'delivery');
  assert.equal(classifySalesIntent('3'), 'tracking');
  assert.equal(classifySalesIntent('4'), 'handover');
  assert.equal(classifySalesIntent('5'), 'handover');
  assert.match(salesMenu(), /1\. Browse products/);
  assert.match(salesMenu(), /5\. Speak with our team/);
});

test('intent classification routes specific requests correctly', () => {
  assert.equal(classifySalesIntent('Do you have wall mirrors?'), 'search');
  assert.equal(classifySalesIntent('How much is delivery to Nairobi?'), 'delivery');
  assert.equal(classifySalesIntent('How can I track my order?'), 'tracking');
  assert.equal(classifySalesIntent('How can I pay online?'), 'checkout');
  assert.equal(classifySalesIntent('Thank you'), 'thanks');
  assert.equal(classifySalesIntent('I want a custom cushion'), 'handover');
  assert.equal(classifySalesIntent('I need a refund'), 'handover');
});

test('human escalation catches menu option and natural requests', () => {
  assert.equal(isHandoverRequest('4'), true);
  assert.equal(isHandoverRequest('5'), true);
  assert.equal(isHandoverRequest('Let me speak to a person'), true);
  assert.equal(isHandoverRequest('I want personalized cushions'), true);
  assert.equal(isHandoverRequest('Show me mirrors'), false);
});

test('catalogue search only returns eligible in-stock products', () => {
  assert.deepEqual(findCatalogueProducts(products, 'show me a wall mirror').map(p => p.id), ['mirror']);
  assert.deepEqual(findCatalogueProducts(products, 'gold lamp').map(p => p.id), []);
  assert.deepEqual(findCatalogueProducts(products, 'any shoe').map(p => p.id), []);
  assert.deepEqual(findCatalogueProducts(products, '1', true).map(p => p.id), ['mirror', 'cushion']);
});

test('product replies quote only live catalogue prices and use website links', () => {
  const result = productReply(findCatalogueProducts(products, 'mirror'), site, false);
  assert.match(result, /Arched Mirror/);
  assert.match(result, /KES 4,000/);
  assert.match(result, /https:\/\/www\.decorbykasiwa\.co\.ke\/shop\/arched-mirror/);
  assert.doesNotMatch(result, /Hidden Mirror|Gold Lamp/);
  assert.doesNotMatch(result, /payment confirmed/i);
});

test('non-matching search does not invent products', () => {
  const result = productReply([], site, false);
  assert.match(result, /couldn't find a matching item/);
  assert.doesNotMatch(result, /KES /);
});

test('delivery quotes use source zones and identify custom quotes', () => {
  const result = deliveryReply([
    { id: 'nairobi', label: 'Nairobi CBD', fee: 100, active: true },
    { id: 'international', label: 'International', fee: 0, active: true, quoteRequired: true },
  ], site);
  assert.match(result, /Nairobi CBD: KES 100/);
  assert.match(result, /International: quote required/);
  assert.doesNotMatch(result, /International: KES/);
});

test('tracking and checkout never claim an order or payment was created', () => {
  assert.match(fixedReply('tracking', site), /\/track-order/);
  assert.match(fixedReply('checkout', site), /cannot create an order/);
  assert.doesNotMatch(fixedReply('checkout', site), /payment confirmed/i);
});
