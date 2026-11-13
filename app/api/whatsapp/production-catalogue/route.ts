import {NextResponse} from 'next/server';
import {signedInternalRequest} from '@/lib/whatsapp/dbk36-production-auth';
import {refreshProductionCatalogue} from '@/lib/whatsapp/dbk36-production-chat';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
/** Independent MAIN Neon catalogue refresh. No staging-cache dependency. */
export async function POST(req:Request){
  const raw=await req.text();
  if(!signedInternalRequest(req.headers,raw))return NextResponse.json({error:'SERVICE_AUTH_DENIED'},{status:403,headers});
  if(raw!=='{"job":"catalogue"}'||process.env.DBK36_WA_PROD_CATALOGUE_SYNC_ENABLED!=='YES')
    return NextResponse.json({error:'CATALOGUE_DISABLED'},{status:503,headers});
  try{return NextResponse.json(await refreshProductionCatalogue(),{headers});}
  catch{return NextResponse.json({error:'CATALOGUE_REFRESH_FAILED_PRESERVING_CACHE'},{status:503,headers});}
}
