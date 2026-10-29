import { NextResponse } from 'next/server';
import { getApiStaff } from '@/lib/auth/api-authorization';
import { dbk64ListOperationalOrders } from '@/lib/db/dbk64-online-neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  const staff = await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({ message: 'Unauthorized' }, { status: staff.status });
  try {
    const orders = await dbk64ListOperationalOrders(200);
    return NextResponse.json({ orders, source: 'neon',
      warning: orders.length >= 200 ? 'Result limit reached; paginate before financial reconciliation' : null },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (cause) {
    console.error('DBK-64 operational readback failed', cause);
    return NextResponse.json({ message: 'Neon online payment records temporarily unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
