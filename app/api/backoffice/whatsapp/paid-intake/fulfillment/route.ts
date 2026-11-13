import {NextRequest,NextResponse} from 'next/server';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {fulfillmentQueue,fulfillmentPreview,commitPaidStock,setFulfillment} from '@/lib/db/dbk36-fulfillment';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const REF=/^DBKWA[A-Z0-9]{7}$/;
const fail=(message:string,status:number)=>NextResponse.json({error:message},{status,headers});
function errorOf(e:unknown){
  const msg=e instanceof Error?e.message:'DBK36_FULFILLMENT_UNAVAILABLE';
  return /^[A-Z0-9_]{4,95}$/.test(msg)?msg:'DBK36_FULFILLMENT_UNAVAILABLE';
}
export async function GET(req:NextRequest){
  const staff=await getApiStaff(['ADMIN']);
  if(!staff.ok)return fail('ACCESS_DENIED',staff.status);
  const reference=req.nextUrl.searchParams.get('reference');
  try{
    if(reference){if(!REF.test(reference))return fail('REFERENCE_INVALID',400);
      return NextResponse.json(await fulfillmentPreview(reference),{headers});}
    return NextResponse.json(await fulfillmentQueue(),{headers});
  }catch(e){return fail(errorOf(e),503);}
}
export async function POST(req:NextRequest){
  const staff=await getApiStaff(['ADMIN']);
  if(!staff.ok)return fail('ACCESS_DENIED',staff.status);
  if(req.headers.get('origin')!==req.nextUrl.origin||
    req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return fail('ORIGIN_OR_CONTENT_TYPE_REJECTED',403);
  let body:unknown;
  try{body=await req.json();}catch{return fail('INVALID_JSON',400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_REQUEST',400);
  const x=body as Record<string,unknown>;
  if(typeof x.reference!=='string'||!REF.test(x.reference)||
     typeof x.action!=='string'||!['COMMIT_STOCK','SET_FULFILLMENT'].includes(x.action)||
     Object.keys(x).some(key=>!['reference','action','confirmation','stockReviewed','state'].includes(key)))
    return fail('INVALID_REQUEST',400);
  try{
    if(x.action==='COMMIT_STOCK'){
      if(x.confirmation!==`COMMIT ${x.reference}`||x.stockReviewed!==true||x.state!==undefined)
        return fail('STAFF_STOCK_APPROVAL_REQUIRED',403);
      return NextResponse.json(await commitPaidStock(x.reference,String(x.confirmation),staff),{headers});
    }
    if(typeof x.state!=='string'||x.confirmation!==`SET ${x.reference} ${x.state}`||
      x.stockReviewed!==undefined)return fail('FULFILLMENT_APPROVAL_REQUIRED',403);
    return NextResponse.json(await setFulfillment(x.reference,x.state,staff),{headers});
  }catch(e){return NextResponse.json({error:errorOf(e),reconciliationRequired:true},{status:409,headers});}
}
