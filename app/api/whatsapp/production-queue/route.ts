import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {processProductionWhatsAppQueue} from '@/lib/whatsapp/dbk36-production-messages';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
/** Recovery for durable production-Neon messages. Never polls staging. */
export async function POST(req:Request){
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))return NextResponse.json({error:'SERVICE_AUTH_DENIED'},{status:403,headers});
  if(raw!=='{"job":"messages"}'||process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES')
    return NextResponse.json({error:'PRODUCTION_BOT_NOT_ENABLED'},{status:503,headers});
  try{return NextResponse.json(await processProductionWhatsAppQueue(2),{headers});}
  catch{return NextResponse.json({error:'MESSAGE_QUEUE_REVIEW_REQUIRED'},{status:503,headers});}
}
