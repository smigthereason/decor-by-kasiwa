import { NextRequest, NextResponse } from 'next/server';
import { getApiStaff } from '@/lib/auth/api-authorization';
import { assessProductionImport, importPaidToProduction, listProductionWhatsAppOrders } from '@/lib/db/dbk36-production-import';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const HEADERS={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const REFERENCE=/^DBKWA[A-Z0-9]{7}$/;
function errorOf(e:unknown) {
  const message=e instanceof Error?e.message:'PRODUCTION_BRIDGE_UNAVAILABLE';
  if (/^[A-Z0-9_,:-]{3,230}$/.test(message)) return message;
  return 'PRODUCTION_BRIDGE_UNAVAILABLE';
}
export async function GET(req: NextRequest) {
  const staff=await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({error:'Access denied'},{status:staff.status,headers:HEADERS});
  const reference=req.nextUrl.searchParams.get('reference') || '';
  if (reference && !REFERENCE.test(reference)) return NextResponse.json({error:'REFERENCE_INVALID'},{status:400,headers:HEADERS});
  try {return NextResponse.json(reference?await assessProductionImport(reference):await listProductionWhatsAppOrders(),{headers:HEADERS});}
  catch(e) {return NextResponse.json({error:errorOf(e)},{status:503,headers:HEADERS});}
}
export async function POST(req: NextRequest) {
  const staff=await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({error:'Access denied'},{status:staff.status,headers:HEADERS});
  // Admin cookies alone are insufficient for a state-changing cross-origin request.
  const origin=req.headers.get('origin');
  if (!origin || origin!==req.nextUrl.origin || req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return NextResponse.json({error:'ORIGIN_OR_CONTENT_TYPE_REJECTED'},{status:403,headers:HEADERS});
  let body: unknown;
  try {body=await req.json();} catch {return NextResponse.json({error:'INVALID_JSON'},{status:400,headers:HEADERS});}
  if (!body || typeof body!=='object' || Array.isArray(body))
    return NextResponse.json({error:'INVALID_IMPORT_REQUEST'},{status:400,headers:HEADERS});
  const value=body as Record<string,unknown>;
  const allowed=new Set(['reference','fullReceipt','confirmation','mappedVariants','fulfillment']);
  if (Object.keys(value).some(k=>!allowed.has(k)) ||
      typeof value.reference!=='string'||!REFERENCE.test(value.reference)||
      typeof value.fullReceipt!=='string'||typeof value.confirmation!=='string'||
      value.fulfillment!=='collection'||
      (value.mappedVariants!=null && (typeof value.mappedVariants!=='object'||Array.isArray(value.mappedVariants))))
    return NextResponse.json({error:'INVALID_IMPORT_REQUEST'},{status:400,headers:HEADERS});
  const mapped: Record<string,string>={};
  if (value.mappedVariants) {
    for (const [product,variant] of Object.entries(value.mappedVariants)) {
      if (!/^[\w.-]{2,180}$/.test(product) || typeof variant!=='string'||variant.length>180)
        return NextResponse.json({error:'INVALID_VARIANT_MAPPING'},{status:400,headers:HEADERS});
      mapped[product]=variant;
    }
  }
  try {
    const result=await importPaidToProduction({reference:value.reference,fullReceipt:value.fullReceipt,
      confirmation:value.confirmation,mappedVariants:mapped,fulfillment:'collection'},staff);
    return NextResponse.json(result,{headers:HEADERS});
  } catch(e) {
    // Never automatically retry an ambiguous write; SQL idempotency protects explicit retries.
    return NextResponse.json({error:errorOf(e),reconciliationRequired:true},
      {status:409,headers:HEADERS});
  }
}
