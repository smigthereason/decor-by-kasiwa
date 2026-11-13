import { NextRequest,NextResponse } from 'next/server';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {listRecordedWhatsAppIntakes,recordWhatsAppPaidIntake} from '@/lib/db/dbk36-paid-intake';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const error=(e:unknown)=>{
  const s=e instanceof Error?e.message:'PAID_INTAKE_UNAVAILABLE';
  return /^[A-Z0-9_]{3,90}$/.test(s)?s:'PAID_INTAKE_UNAVAILABLE';
};
export async function GET() {
  const staff=await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({error:'ACCESS_DENIED'},{status:staff.status,headers});
  try {return NextResponse.json(await listRecordedWhatsAppIntakes(),{headers});}
  catch(e){return NextResponse.json({error:error(e)},{status:503,headers});}
}
export async function POST(req:NextRequest) {
  const staff=await getApiStaff(['ADMIN']);
  if (!staff.ok) return NextResponse.json({error:'ACCESS_DENIED'},{status:staff.status,headers});
  if (req.headers.get('origin')!==req.nextUrl.origin ||
      req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return NextResponse.json({error:'ORIGIN_OR_CONTENT_TYPE_REJECTED'},{status:403,headers});
  let body:unknown;
  try {body=await req.json();}catch{return NextResponse.json({error:'BAD_JSON'},{status:400,headers});}
  if (!body || typeof body!=='object' || Array.isArray(body))
    return NextResponse.json({error:'BAD_REQUEST'},{status:400,headers});
  const b=body as Record<string,unknown>;
  if (Object.keys(b).some(k=>!['reference','receipt','confirmedKes','confirmation','merchantTillChecked'].includes(k)) ||
      typeof b.reference!=='string' || typeof b.receipt!=='string' ||
      typeof b.confirmedKes!=='number' || typeof b.confirmation!=='string' ||
      b.merchantTillChecked!==true)
    return NextResponse.json({error:'BAD_REQUEST'},{status:400,headers});
  try {
    const result=await recordWhatsAppPaidIntake({reference:b.reference,receipt:b.receipt,
      confirmedKes:b.confirmedKes,confirmation:b.confirmation,
      merchantTillChecked:true},staff);
    return NextResponse.json(result,{headers});
  }catch(e){return NextResponse.json({error:error(e),reconciliationRequired:true},{status:409,headers});}
}
