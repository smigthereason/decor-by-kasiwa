import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {recordProductionWhatsAppInbound,processProductionWhatsAppQueue} from '@/lib/whatsapp/dbk36-production-messages';
import {after} from 'next/server';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=45;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
/** Only the dedicated Worker accepts Meta webhook, verifies x-hub-signature,
 * and HMAC-forwards the unmodified body to this private production route. */
export async function POST(req:Request){
  if(req.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')
    return NextResponse.json({error:'CONTENT_TYPE_DENIED'},{status:415,headers});
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))
    return NextResponse.json({error:'SERVICE_AUTH_DENIED'},{status:403,headers});
  try{
    const result=await recordProductionWhatsAppInbound(JSON.parse(raw));
    if(result.accepted>0)after(async()=>{await processProductionWhatsAppQueue(2);});
    return NextResponse.json(result,{headers});
  }catch{return NextResponse.json({error:'PRODUCTION_MESSAGE_NOT_DURABLE'},{status:503,headers});}
}
