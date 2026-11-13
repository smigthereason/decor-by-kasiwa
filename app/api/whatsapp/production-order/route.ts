import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {createProductionCheckout} from '@/lib/db/dbk36-production-payments';
import {cleanError} from '@/lib/whatsapp/dbk36-production-core';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=45;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
/** Can only be called by authenticated production bot service. REAL M-Pesa charge. */
export async function POST(req:Request){
  if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return NextResponse.json({error:'CONTENT_TYPE_INVALID'},{status:415,headers});
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))return NextResponse.json({error:'SERVICE_AUTH_DENIED'},{status:403,headers});
  let json:unknown;
  try{json=JSON.parse(raw);}catch{return NextResponse.json({error:'JSON_INVALID'},{status:400,headers});}
  try{return NextResponse.json(await createProductionCheckout(json),{headers});}
  catch(e){return NextResponse.json({error:cleanError(e),retryPayment:false},{status:409,headers});}
}
