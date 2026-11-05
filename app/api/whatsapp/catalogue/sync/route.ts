import { NextResponse } from 'next/server';
import { safeMatch } from '@/lib/whatsapp/core';
import { refreshWhatsAppCatalogue } from '@/lib/whatsapp/catalogue-cache';
import { isProductionSyncApproved } from '@/lib/whatsapp/production-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Local test-only manual sync. NEVER exposed by the Cloudflare webhook gateway. */
export async function POST(request:Request) {
  const expected=process.env.WHATSAPP_WORKER_SECRET?.trim();
  if (!safeMatch(request.headers.get('authorization'),expected?`Bearer ${expected}`:null))
    return NextResponse.json({error:'Unauthorized'},{status:401});
  const database=process.env.DATABASE_URL;
  let safeDatabase=false;
  try {
    const host=new URL(database||'').hostname;
    safeDatabase=host.endsWith('.neon.tech') && !host.startsWith('ep-steep-scene-bausr4ct');
  } catch { /* fail closed */ }
  if (!safeDatabase || process.env.DBK36_TEST_WEBHOOK_BYPASS !== 'YES')
    return NextResponse.json({error:'DBK-36 isolated test server required'},{status:403});
  try {
    const result=await refreshWhatsAppCatalogue();
    return NextResponse.json({ok:true,...result},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('[DBK-36] Catalogue refresh failed',error instanceof Error?error.message:'unknown');
    return NextResponse.json({error:'Catalogue sync unavailable; existing cache retained'},{status:503});
  }
}

/** Authenticated GET for an external production scheduler. No production POST bypass. */
export async function GET(request: Request) {
  const expected = process.env.WHATSAPP_WORKER_SECRET?.trim();
  if (!safeMatch(request.headers.get('authorization'), expected ? `Bearer ${expected}` : null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isProductionSyncApproved(process.env)) {
    return NextResponse.json({ error: 'Production catalogue sync is not enabled' }, { status: 403 });
  }
  try {
    const result = await refreshWhatsAppCatalogue();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[DBK-36] Production catalogue sync failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Catalogue refresh unavailable; previous cache retained' }, { status: 503 });
  }
}
