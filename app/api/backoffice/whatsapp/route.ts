import { NextResponse } from 'next/server';
import { getApiStaff } from '@/lib/auth/api-authorization';
import { getWhatsAppConversations } from '@/lib/whatsapp/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const staff = await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({ error: 'Access denied' }, { status: staff.status });
  try {
    const conversations = await getWhatsAppConversations();
    return NextResponse.json({ conversations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DBK-36] Inbox unavailable', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Inbox unavailable' }, { status: 503 });
  }
}
