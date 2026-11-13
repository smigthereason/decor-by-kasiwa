import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {recoverProductionPayments} from '@/lib/db/dbk36-production-payments';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:Request){
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))return NextResponse.json({error:'SERVICE_AUTH_DENIED'},{status:403,headers});
  if(raw!=='{"job":"recover"}')return NextResponse.json({error:'JOB_INVALID'},{status:400,headers});
  try{return NextResponse.json(await recoverProductionPayments(),{headers});}
  catch{return NextResponse.json({error:'PRODUCTION_RECOVERY_UNAVAILABLE'},{status:503,headers});}
}
