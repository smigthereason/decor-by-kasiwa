import { NextResponse } from 'next/server';
import { getApiStaff } from '@/lib/auth/api-authorization';
import { canSendManualReply, changeConversationMode, getConversationMessages,
  isHumanConversation, recordManualReply } from '@/lib/whatsapp/store';
import { sendWhatsAppText } from '@/lib/whatsapp/processor';
import { isPermittedWhatsAppStaffOrigin } from '@/lib/auth/local-test-auth-policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
type Context = { params: Promise<{ waId: string }> };

function sameOrigin(request: Request) {
  // Enforce normal same-origin checks, with a tightly scoped local-only
  // fallback for an internal Next.js request URL host mismatch.
  return isPermittedWhatsAppStaffOrigin(
    request.headers.get('origin'),
    request.url,
    request.method,
    process.env,
  );
}

export async function GET(_request: Request, { params }: Context) {
  const staff = await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({ error: 'Access denied' }, { status: staff.status });
  const { waId } = await params;
  if (!/^\d{7,16}$/.test(waId)) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  try {
    return NextResponse.json({ messages: await getConversationMessages(waId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DBK-36] Conversation read failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Conversation unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: Context) {
  const staff = await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({ error: 'Access denied' }, { status: staff.status });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const { waId } = await params;
  if (!/^\d{7,16}$/.test(waId)) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  let body: { action?: string; text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  try {
    if (body.action === 'mode' && (body.text === 'bot' || body.text === 'human')) {
      const changed = await changeConversationMode(waId, body.text);
      return NextResponse.json({ ok: changed }, { status: changed ? 200 : 404 });
    }
    if (body.action !== 'send' || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1500) {
      return NextResponse.json({ error: 'Invalid action or text' }, { status: 400 });
    }
    if (!await isHumanConversation(waId)) {
      return NextResponse.json({ error: 'Take over this conversation before replying' }, { status: 409 });
    }
    if (!await canSendManualReply(waId)) {
      return NextResponse.json({ error: 'WhatsApp customer-service window expired; an approved template is required' }, { status: 409 });
    }
    const reply = body.text.trim();
    const providerId = await sendWhatsAppText(waId, reply);
    await recordManualReply(waId, reply, providerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DBK-36] Staff action failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Unable to complete action' }, { status: 503 });
  }
}
