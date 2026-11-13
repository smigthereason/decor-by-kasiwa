/** DBK-93: read-only assessment; no production mutations. */
export const PRODUCTION_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export const TARGET_FLAGS = Object.freeze({
  DBK62_POS_BACKEND: 'neon', DBK62_CUTOVER_APPROVED: 'YES',
  DBK64_ONLINE_BACKEND: 'neon', DBK64_CUTOVER_APPROVED: 'YES',
  DBK68_MPESA_BACKEND: 'neon', DBK_INVENTORY_BACKEND: 'neon',
  DBK69_INVENTORY_ADMIN: 'enabled',
  DBK_AUDIT_WRITE_BACKEND: 'neon', DBK_AUDIT_ARCHIVE_READ: '1',
  DBK_AUDIT_LIVE_READ: '1', DBK_STAFF_ACTIVITY_BACKEND: 'neon',
});

export function assessDBK93({url, flags = {}, audit}) {
  const blockers = [];
  let identityOk = false;
  try {
    const db = new URL(url || '');
    identityOk = ['postgres:','postgresql:'].includes(db.protocol) &&
      db.hostname === PRODUCTION_HOST && db.pathname === '/neondb';
  } catch { /* handled below */ }
  if (!identityOk) blockers.push('Wrong Neon database; production host and /neondb required');
  if (!audit || audit.assessment?.databaseChecksPassed !== true) {
    blockers.push(...(audit?.assessment?.blockers || ['DBK-76 readiness audit did not pass']));
  }
  if (!audit?.observed?.dbk90?.rowsMatch)
    blockers.push('DBK-90 logged stock reconciliation does not match current Neon state');
  const flagsOnly = Object.fromEntries(Object.entries(TARGET_FLAGS).map(([k,v]) =>
    [k, {current: flags[k] || 'UNSET', required: v, matches: flags[k] === v}]));
  const mismatched = Object.entries(flagsOnly).filter(([,v])=>!v.matches).map(([k])=>k);
  if (mismatched.length) blockers.push('Local flags differ from target: ' + mismatched.join(', '));
  return {
    stage:'DBK-93',mode:'READ_ONLY_NEON_NEW_WRITES_PREFLIGHT',
    databaseIdentityOk:identityOk,
    assessmentStatus: audit?.assessment?.status || 'UNKNOWN',
    flagValuesAreLocalNotVercelProduction:true,
    flags:flagsOnly,blockers:[...new Set(blockers)],
    activationAuthorized:false,
    instructions:'Do not change deployed flags or database gates without an approved stock/financial/provider-callback cutover.',
    note:'Existing DBK-62/64/68/69 application routes already write new records to Neon when their independent flags and database gates are approved. This script does not enable them, deploy, or delete Sanity records.'
  };
}
