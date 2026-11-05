import { after, NextResponse } from 'next/server';
import { parseIncomingMessages, safeMatch, verifyMetaSignature } from '@/lib/whatsapp/core';
import { recordIncoming } from '@/lib/whatsapp/store';
import { processWhatsAppQueue } from '@/lib/whatsapp/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const noCache = { 'Cache-Control': 'no-store' };

/** Meta webhook handshake: never expose the verify token to the browser. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const good = url.searchParams.get('hub.mode') === 'subscribe'
    && safeMatch(url.searchParams.get('hub.verify_token'), token);
  const challenge = url.searchParams.get('hub.challenge');
  if (!good || !challenge || challenge.length > 200) {
    return new Response('Verification failed', { status: 403, headers: noCache });
  }
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', ...noCache } });
}

/** Authenticate raw request bytes, persist before acknowledging, then process outside the response. */
export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length') || '0');
  if (length > 262144) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 262144) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let data: unknown;
  try { data = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneId) return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  const messages = parseIncomingMessages(data, phoneId);
  try {
    for (const message of messages) await recordIncoming(message);
  } catch (error) {
    console.error('[DBK-36] Inbound persistence failed', error instanceof Error ? error.message : 'unknown');
    // Non-2xx causes Meta to redeliver; unique provider ID makes it idempotent.
    return NextResponse.json({ error: 'Unable to persist incoming message' }, { status: 503 });
  }
  if (messages.length > 0 && process.env.WHATSAPP_BOT_ENABLED === 'YES') {
    after(async () => {
      try { await processWhatsAppQueue(); }
      catch (error) { console.error('[DBK-36] Background worker failed', error instanceof Error ? error.message : 'unknown'); }
    });
  }
  return NextResponse.json({ received: true }, { headers: noCache });
}
