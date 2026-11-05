#!/usr/bin/env node
/** Read-only source gate: does not connect to Meta, Sanity, Neon, or deploy. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export function inspectDbk36iSource(repo) {
  const read = path => existsSync(join(repo,path)) ? readFileSync(join(repo,path),'utf8') : '';
  const sender = read('lib/whatsapp/processor.ts');
  const gate = read('lib/whatsapp/production-policy.ts');
  const sync = read('app/api/whatsapp/catalogue/sync/route.ts');
  const event = read('app/api/whatsapp/catalogue/event/route.ts');
  const worker = read('app/api/whatsapp/process/route.ts');
  const webhook = read('app/api/whatsapp/webhook/route.ts');
  const proxy = read('proxy.ts');
  const checks = [
    ['signed-meta-webhook', /verifyMetaSignature/.test(webhook) && /recordIncoming/.test(webhook)],
    ['production-recipient-policy', /isAllowedWhatsAppRecipient/.test(sender) && /DBK36_PRODUCTION_LAUNCH_APPROVED/.test(gate) && /WHATSAPP_TEST_RECIPIENTS/.test(gate)],
    ['authenticated-production-catalogue-sync', /export async function GET/.test(sync) && /isProductionSyncApproved/.test(sync) && /safeMatch/.test(sync)],
    ['signed-sanity-webhook', /parseBody/.test(event) && /sanity-dataset/.test(event) && /refreshWhatsAppCatalogue/.test(event)],
    ['authenticated-queue-worker', /WHATSAPP_WORKER_SECRET/.test(worker) && /processWhatsAppQueue/.test(worker)],
    ['DBK74-narrow-ingress', /allowProductionDbk36WebhookPost/.test(proxy) && /database identity mismatch/.test(proxy)],
  ];
  return checks.map(([name, ok])=>({name, codeImplemented:ok}));
}

if (process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  const root=resolve(process.argv.find(x=>x.startsWith('--repo='))?.slice(7) || '.');
  const checks=inspectDbk36iSource(root);
  console.log('DBK-36I — SOURCE IMPLEMENTATION CHECK (read-only)');
  for (const c of checks) console.log(`${c.codeImplemented?'PASS':'BLOCK'} ${c.name}`);
  console.log('\nNOT VERIFIED: deployment, production token/number, schedules, live signature delivery, database tables, DBK-74 freeze state, staff admin operations, rollback.');
  console.log('Source checks do not authorize production launch.');
  if(checks.some(c=>!c.codeImplemented))process.exitCode=2;
}
