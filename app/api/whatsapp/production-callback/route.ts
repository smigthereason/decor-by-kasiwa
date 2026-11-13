import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {acceptProductionStkCallback} from '@/lib/db/dbk36-production-payments';
import type {DarajaStkCallbackPayload} from '@/lib/whatsapp/dbk36-production-daraja';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=45;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
/** Worker HMAC is required. Persist raw callback BEFORE acknowledging Safaricom.
 * Payment is not recorded until independent Daraja STK Query agrees with original order.
 */
export async function POST(req:Request){
  if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return NextResponse.json({ResultCode:1,ResultDesc:'Content type denied'},{status:415,headers});
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))return NextResponse.json({ResultCode:1,ResultDesc:'Denied'},{status:403,headers});
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{return NextResponse.json({ResultCode:1,ResultDesc:'Invalid JSON'},{status:400,headers});}
  try{
    const result=await acceptProductionStkCallback(payload as DarajaStkCallbackPayload);
    return NextResponse.json({ResultCode:0,ResultDesc:'Accepted',...result},{headers});
  }catch{
    return NextResponse.json({ResultCode:1,ResultDesc:'Storage unavailable'},{status:503,headers});
  }
}
