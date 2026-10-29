// DBK-74 — production maintenance barrier, backed by one shared Neon singleton.
// INSTALL migration/dbk74/maintenance-control.sql BEFORE deploying this code.
// No cutover is performed by this proxy. Provider callbacks are durably QUEUED,
// NEVER treated as verified paid, and must be reconciled before reopening.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { NextResponse, type NextRequest } from 'next/server';
import { callbackProvider, isWriteMethod, isPausedPage, validateQueuedBody } from './lib/maintenance/dbk74-core';

const HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
function database() {
  if (!process.env.DATABASE_URL) throw new Error('DBK74: DATABASE_URL unavailable');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== HOST ||
      decodeURIComponent(url.pathname.slice(1)) !== 'neondb') {
    throw new Error('DBK74: database identity mismatch');
  }
  return neon(process.env.DATABASE_URL);
}
function notAvailable(message = 'Purchases and stock changes are temporarily paused for maintenance.') {
  return NextResponse.json({ message, code: 'DBK74_MAINTENANCE' },
    { status: 423, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } });
}
function isValidPaystackSignature(body: string, signature: string | null): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !process.env.PAYSTACK_SECRET_KEY) return false;
  const digest = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
  return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'));
}
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const needsRead = isWriteMethod(request.method) || isPausedPage(pathname);
  if (!needsRead) return NextResponse.next();
  try {
    const sql = database();
    const rows = await sql`SELECT active FROM public.dbk74_freeze_control WHERE singleton=true LIMIT 1`;
    if (rows.length !== 1 || typeof rows[0].active !== 'boolean')
      throw new Error('DBK74 control is missing or invalid');
    if (rows[0].active !== true) return NextResponse.next();
    if (!isWriteMethod(request.method)) {
      return NextResponse.redirect(new URL('/maintenance', request.url), 307);
    }
    const provider = callbackProvider(pathname);
    if (!provider || request.method !== 'POST') return notAvailable();
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json'))
      return NextResponse.json({ message: 'JSON required' }, { status: 415 });
    const length = Number(request.headers.get('content-length') || '0');
    if (length > 65536) return NextResponse.json({ message: 'Payload too large' }, { status: 413 });
    const raw = await request.text();
    if (!validateQueuedBody(provider, raw))
      return NextResponse.json({ message: 'Invalid callback body' }, { status: 400 });
    if (provider === 'paystack' && !isValidPaystackSignature(raw, request.headers.get('x-paystack-signature')))
      return NextResponse.json({ message: 'Invalid webhook signature' }, { status: 401 });
    // M-Pesa has no equivalent callback signature. This stores only an untrusted
    // notification; Safaricom provider verification is REQUIRED for settlement.
    const checksum = createHash('sha256').update(provider + '\n' + raw).digest('hex');
    const saved = await sql`INSERT INTO public.dbk74_queued_callbacks
      (provider, content_hash, payload, request_path)
      VALUES (${provider}, ${checksum}, ${raw}::jsonb, ${pathname})
      ON CONFLICT (content_hash) DO UPDATE SET last_seen_at=now(), attempts=public.dbk74_queued_callbacks.attempts + 1
      RETURNING id`;
    if (saved.length !== 1) throw new Error('DBK74 callback not persisted');
    if (provider === 'daraja') {
      return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' },
        { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ received: true, queued: true },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    // Avoid printing raw provider payloads, credentials, or customer details.
    console.error('[DBK74] maintenance barrier unavailable', cause instanceof Error ? cause.message : 'unknown');
    return NextResponse.json({ message: 'Checkout temporarily unavailable. Contact support for payment status.',
      code: 'DBK74_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
