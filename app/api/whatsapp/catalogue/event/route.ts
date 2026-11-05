import { NextResponse, type NextRequest } from 'next/server';
import { parseBody } from 'next-sanity/webhook';
import { refreshWhatsAppCatalogue } from '@/lib/whatsapp/catalogue-cache';
import { isProductionSanityWebhookApproved } from '@/lib/whatsapp/production-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Signed product-change events from Sanity. Repeated events are safe to replay. */
export async function POST(request: NextRequest) {
  if (!isProductionSanityWebhookApproved(process.env)) {
    return NextResponse.json({ error: 'Not enabled' }, { status: 403 });
  }
  const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET?.trim();
  if (!dataset || request.headers.get('sanity-dataset') !== dataset) {
    return NextResponse.json({ error: 'Invalid dataset' }, { status: 403 });
  }
  const operation = request.headers.get('sanity-operation');
  if (!['create', 'update', 'delete'].includes(operation || '')) {
    return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
  }
  if (Number(request.headers.get('content-length') || '0') > 65536) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  try {
    // parseBody checks the signed raw request and waits briefly for Sanity consistency.
    const { isValidSignature } = await parseBody(request, process.env.DBK36_SANITY_WEBHOOK_SECRET, true);
    if (!isValidSignature) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // Sanity-side GROQ filter restricts this webhook to published product changes.
    // Refreshing is idempotent, and failed refreshes keep the previous Neon cache.
    const result = await refreshWhatsAppCatalogue();
    return NextResponse.json({ ok: true, count: result.count, syncedAt: result.syncedAt },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DBK-36] Signed Sanity refresh failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Catalogue refresh unavailable' }, { status: 503 });
  }
}
