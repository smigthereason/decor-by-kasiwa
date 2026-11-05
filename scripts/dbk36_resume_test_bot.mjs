/**
 * DBK-36E: Resume exactly one approved test WhatsApp conversation.
 * Run ONLY using the isolated Neon test configuration.
 *
 * Read-only: node --env-file=<private-test-env> scripts/dbk36_resume_test_bot.mjs --list
 * Change:    node --env-file=<private-test-env> scripts/dbk36_resume_test_bot.mjs --resume=<wa_id> --confirm-test-only
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const KNOWN_PRODUCTION_ENDPOINT_PREFIX = 'ep-steep-scene-bausr4ct';

export function getSafeTestConfig(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing; use the isolated WhatsApp test env file');
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid test DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/i.test(url.hostname)
    || url.hostname.startsWith(KNOWN_PRODUCTION_ENDPOINT_PREFIX)) {
    throw new Error('STOP: DATABASE_URL is not an approved isolated Neon test endpoint');
  }
  if (env.DBK36_PRODUCTION === 'YES' || env.NODE_ENV === 'production') {
    throw new Error('STOP: production configuration is not permitted');
  }
  const recipients = (env.WHATSAPP_TEST_RECIPIENTS || '')
    .split(',').map(s => s.trim().replace(/^\+/, '')).filter(Boolean);
  if (recipients.length < 1 || recipients.length > 10 || !recipients.every(s => /^\d{8,15}$/.test(s))) {
    throw new Error('STOP: expected 1–10 approved test recipient phone numbers');
  }
  return { databaseUrl: env.DATABASE_URL, recipients: [...new Set(recipients)] };
}

export function parseAction(argv, approvedRecipients) {
  if (argv.length === 1 && argv[0] === '--list') return { action: 'list' };
  const resumeArg = argv.find(arg => arg.startsWith('--resume='));
  if (argv.length !== 2 || !resumeArg || !argv.includes('--confirm-test-only')) {
    throw new Error('Use --list, or --resume=<approved_test_wa_id> --confirm-test-only');
  }
  const waId = resumeArg.slice('--resume='.length).replace(/^\+/, '');
  if (!approvedRecipients.includes(waId)) {
    throw new Error('STOP: conversation is not in WHATSAPP_TEST_RECIPIENTS');
  }
  return { action: 'resume', waId };
}

export async function main(env = process.env, argv = process.argv.slice(2)) {
  const config = getSafeTestConfig(env);
  const action = parseAction(argv, config.recipients);
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(config.databaseUrl);

  if (action.action === 'list') {
    let found = 0;
    for (const waId of config.recipients) {
      const rows = await sql`SELECT wa_id, mode, updated_at FROM public.dbk36_wa_conversations WHERE wa_id = ${waId} LIMIT 1`;
      const row = rows[0];
      if (row) {
        console.log(`APPROVED TEST: ${row.wa_id} | mode=${row.mode} | updated=${row.updated_at}`);
        found++;
      }
    }
    if (!found) console.log('No approved test conversations found in this Neon database.');
    return;
  }

  // The WHERE clause ensures no other conversation is modified and the action is idempotent.
  const rows = await sql`UPDATE public.dbk36_wa_conversations SET mode='bot', updated_at=now()
    WHERE wa_id=${action.waId} AND mode='human'
    RETURNING wa_id, mode`;
  if (rows.length === 1) {
    console.log(`Approved test conversation ${action.waId}: mode=bot. Send a NEW MENU message.`);
  } else {
    const existing = await sql`SELECT mode FROM public.dbk36_wa_conversations WHERE wa_id=${action.waId} LIMIT 1`;
    console.log(existing.length
      ? `No update needed. Approved test conversation mode=${existing[0].mode}.`
      : 'No matching approved test conversation found; nothing changed.');
  }
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (executedDirectly) {
  main().catch(error => {
    // No URLs, credentials or connection strings in terminal output.
    console.error('[DBK-36E] Operation stopped:', error instanceof Error ? error.message : 'Unexpected error');
    process.exitCode = 1;
  });
}
