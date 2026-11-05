import { NextResponse } from 'next/server';
import { safeMatch } from '@/lib/whatsapp/core';
import { processWhatsAppQueue } from '@/lib/whatsapp/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Authenticated recovery worker for missed after() executions; schedule externally if needed. */
export async function GET(request: Request) {
  const expected = process.env.WHATSAPP_WORKER_SECRET?.trim();
  const auth = request.headers.get('authorization') || '';
  if (!safeMatch(auth, expected ? `Bearer ${expected}` : null)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
  }
  try {
    const result = await processWhatsAppQueue(2);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DBK-36] Worker failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Worker unavailable' }, { status: 503 });
  }
}
