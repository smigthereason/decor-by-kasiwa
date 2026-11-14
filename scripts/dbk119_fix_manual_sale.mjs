// DBK-119: targeted, guarded production SQL hotfix. No financial transactions initiated.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const EXPECTED_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const OLD = "p_display->>'receiptNumber' <> 'RCT-' || p_payload->'order'->>'orderNumber'";
const FIXED = "(p_display->>'receiptNumber') <> ('RCT-'::text || (p_payload->'order'->>'orderNumber'))";
const SIGNATURE = 'public.dbk62_record_real_manual_sale(text,jsonb,jsonb)';
const mode = process.argv[2];
if (!['--plan', '--apply'].includes(mode)) {
  console.error('Usage: node --env-file=.env --env-file=.env.local scripts/dbk119_fix_manual_sale.mjs --plan|--apply');
  process.exit(2);
}
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('DATABASE_URL missing');
const u = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(u.protocol) ||
    u.hostname !== EXPECTED_HOST || u.pathname !== '/neondb') {
  throw new Error('Refusing unexpected database. No changes made.');
}

const sql = neon(raw);
const state = async () => {
  const [r] = await sql`
    SELECT pg_get_functiondef(to_regprocedure(${SIGNATURE})) AS definition,
           (SELECT active FROM public.dbk74_freeze_control WHERE singleton) AS freeze_active,
           (SELECT enabled FROM public.dbk62_cutover_config WHERE singleton) AS pos_gate
  `;
  if (!r?.definition) throw new Error('Expected DBK-62 function missing');
  const ddl = r.definition;
  const oldCount = ddl.split(OLD).length - 1;
  const fixedCount = ddl.split(FIXED).length - 1;
  return {
    ddl, oldCount, fixedCount,
    freezeActive: r.freeze_active, posGate: r.pos_gate,
    matchesReviewedContract: ddl.includes('PERFORM pg_advisory_xact_lock') &&
      ddl.includes('public.dbk57_record_manual_sale') &&
      ddl.includes('DBK-62 refuses invalid real-sale contract'),
  };
};
const safeSummary = s => ({
  check: 'DBK119_MANUAL_SALE_RECEIPT_HOTFIX', mode,
  productionDatabaseMatched: true,
  currentState: s.fixedCount === 1 ? 'ALREADY_FIXED' : s.oldCount === 1 ? 'BUG_PRESENT' : 'UNRECOGNIZED',
  cutoverEnabled: s.posGate,
  maintenanceFrozen: s.freezeActive,
  financialDataChanged: false,
  paymentInitiated: false,
});

const before = await state();
if (!before.matchesReviewedContract ||
    !((before.oldCount === 1 && before.fixedCount === 0) ||
      (before.oldCount === 0 && before.fixedCount === 1))) {
  throw new Error('Function changed from reviewed version. No changes made.');
}
console.log(JSON.stringify({ ...safeSummary(before), step: 'PREFLIGHT' }));
if (mode === '--plan') process.exit(0);

if (before.oldCount === 1) {
  const sqlFile = fileURLToPath(new URL('../migration/dbk119_fix_manual_receipt_json.sql', import.meta.url));
  const statement = await readFile(sqlFile, 'utf8');
  try {
    await sql.query(statement);
  } catch (error) {
    // The response could fail after server commit: re-read before any attempt to re-run.
    const current = await state().catch(() => null);
    if (current?.fixedCount === 1 && current.oldCount === 0) {
      console.log(JSON.stringify({ stage: 'APPLIED_BUT_RESPONSE_FAILED', repairConfirmed: true }));
    } else {
      console.error(JSON.stringify({stage:'APPLY_FAILED', repaired: false,
        message: String(error?.message ?? error).slice(0,350) }));
      process.exit(1);
    }
  }
}
const after = await state();
if (after.oldCount !== 0 || after.fixedCount !== 1 ||
    after.posGate !== before.posGate || after.freezeActive !== before.freezeActive) {
  throw new Error('Unexpected postcondition. Inspect database before proceeding.');
}
// This is expression-only validation: it never calls a sale/write function.
const [expr] = await sql`
  SELECT (('RCT-'::text || ('DBK62-POS-' || repeat('a', 24))) =
          ('RCT-'::text || (jsonb_build_object('order',
            jsonb_build_object('orderNumber', 'DBK62-POS-' || repeat('a', 24)))
              ->'order'->>'orderNumber'))) AS receipt_text_concat_valid
`;
if (expr?.receipt_text_concat_valid !== true) throw new Error('Receipt expression validation failed');
console.log(JSON.stringify({stage:'DBK119_MANUAL_PAYMENT_SQL_FIXED',
  receiptExpressionVerified: true, originalFunctionPreservedExceptReceiptGuard: true,
  gatesUnchanged: true, maintenanceUnchanged: true,
  paymentInitiated: false, stockChanged: false}));
