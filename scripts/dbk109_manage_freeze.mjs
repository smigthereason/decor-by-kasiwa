#!/usr/bin/env node
/**
 * DBK-109: manage the production DBK-74 maintenance gate.
 * This NEVER activates payment/stock gates and NEVER initiates a payment.
 * Run after the DBK-109 application patch has been deployed to production.
 * --status (read-only) | --freeze --confirm-production-maintenance |
 * --unfreeze --confirm-production-maintenance
 * Reconcile all in-flight callbacks before taking a stock snapshot or unfreezing.
 */
import { neon } from '@neondatabase/serverless';

const expectedHost='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const url=process.env.DATABASE_URL;
if (!url) throw new Error('Missing production DATABASE_URL');
const u=new URL(url);
if (!['postgres:','postgresql:'].includes(u.protocol) ||
    u.hostname!==expectedHost || decodeURIComponent(u.pathname.slice(1))!=='neondb') {
  throw new Error('Refusing to access non-production Neon database');
}
const args=process.argv.slice(2);
const modes=['--status','--freeze','--unfreeze'].filter(a=>args.includes(a));
if (modes.length!==1 || args.some(x=>!['--status','--freeze','--unfreeze','--confirm-production-maintenance'].includes(x))) {
  throw new Error('Use --status OR --freeze/--unfreeze --confirm-production-maintenance');
}
const mode=modes[0];
if (mode!=='--status' && !args.includes('--confirm-production-maintenance')) {
  throw new Error('Production maintenance confirmation missing; nothing changed');
}
if (mode==='--status' && args.includes('--confirm-production-maintenance')) {
  throw new Error('Status mode is read only; remove confirmation flag');
}
const sql=neon(url);
const [state]=await sql`SELECT active,updated_at,operator_note FROM public.dbk74_freeze_control WHERE singleton=true`;
if (!state) throw new Error('DBK-74 maintenance control is not installed');
const [counts]=await sql`SELECT
  (SELECT count(*)::int FROM public.dbk74_queued_callbacks WHERE reconciliation_status='PENDING') AS pending_callbacks,
  (SELECT count(*)::int FROM public.dbk68_daraja_orders WHERE payment_status IN ('STARTING','PENDING')) AS in_flight_stk,
  (SELECT count(*)::int FROM public.dbk68_daraja_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED') AS mpesa_stock_review,
  (SELECT count(*)::int FROM public.dbk64_online_orders WHERE payment_status='PAID' AND stock_status<>'COMMITTED') AS online_stock_review`;
if (!counts) throw new Error('Payment reconciliation state unavailable');
if (mode==='--status') {
  console.log(JSON.stringify({mode:'DBK109_FREEZE_STATUS',freezeActive:state.active,...counts,
    changesMade:false},null,2));
} else {
  // Never reopen sales while confirmed money or callbacks still require reconciliation.
  if (mode==='--unfreeze' && Object.values(counts).some(v=>Number(v)>0)) {
    throw new Error('Cannot unfreeze: pending callbacks/STK or paid stock exceptions exist; reconcile first');
  }
  const next=mode==='--freeze';
  if (state.active===next) {
    console.log(JSON.stringify({mode,freezeActive:next,alreadyInDesiredState:true,changed:false,
      ...counts},null,2));
  } else {
    const rows=await sql`UPDATE public.dbk74_freeze_control
      SET active=${next},updated_at=now(),operator_note=${'DBK109 operator-controlled maintenance '+mode}
      WHERE singleton=true AND active IS DISTINCT FROM ${next}
      RETURNING active,updated_at`;
    if (rows.length!==1 || rows[0].active!==next) throw new Error('Freeze update not confirmed');
    console.log(JSON.stringify({mode,freezeActive:next,changed:true,...counts,
      note:'New POS/Paystack/inventory mutations will be paused by DBK109 app routes when deployed. Existing provider callbacks are not blocked; reconcile them before a final stock snapshot.'},null,2));
  }
}
