import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {buildDemoCatalogue,normalizeTurns,makeInput,DEMO_INSTRUCTIONS,extractResponseText} from '@/lib/whatsapp/dbk36-ai-demo-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=40;
const MAIN_DB_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const HEADERS={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:HEADERS});
function mainSql(){
  const raw=process.env.DATABASE_URL||'';
  let u:URL;try{u=new URL(raw);}catch{throw new Error('MAIN_DB_MISSING');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==MAIN_DB_HOST||u.pathname!=='/neondb'||
    u.searchParams.get('sslmode')!=='require'||!u.password)throw new Error('MAIN_DB_PIN_MISMATCH');
  return neon(u.toString());
}
function demoEnabled(){return process.env.VERCEL_ENV==='production'&&process.env.DBK36_WA_AI_DEMO_ENABLED==='YES'&&process.env.DBK36_STAGING_WORKER!=='YES';}
export async function GET(){
  let staff:Awaited<ReturnType<typeof getApiStaff>>;
  try{staff=await getApiStaff(['ADMIN']);}
  catch(e){console.error('DBK99_AI_AUTH_FAILURE',{route:'GET',errorName:e instanceof Error?e.name:'Unknown'});
    return fail('AUTH_CHECK_UNAVAILABLE',503);}
  if(!staff.ok)return fail('ACCESS_DENIED',staff.status);
  return NextResponse.json({enabled:demoEnabled()&&Boolean(process.env.OPENAI_API_KEY),model:'gpt-4.1-mini',mode:'ADMIN_DEMO',payments:false,stockWrites:false},{headers:HEADERS});
}
export async function POST(req:NextRequest){
  let staff:Awaited<ReturnType<typeof getApiStaff>>;
  try{staff=await getApiStaff(['ADMIN']);}
  catch(e){console.error('DBK99_AI_AUTH_FAILURE',{route:'POST',errorName:e instanceof Error?e.name:'Unknown'});
    return fail('AUTH_CHECK_UNAVAILABLE',503);}
  if(!staff.ok)return fail('ACCESS_DENIED',staff.status);
  if(!demoEnabled())return fail('DEMO_DISABLED',503);
  if(!process.env.OPENAI_API_KEY)return fail('OPENAI_KEY_NOT_CONFIGURED',503);
  if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
    return fail('ORIGIN_OR_CONTENT_TYPE_REJECTED',403);
  let raw:unknown;try{raw=await req.json();}catch{return fail('INVALID_JSON',400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('INVALID_REQUEST',400);
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).some(x=>!['question','turns'].includes(x))||typeof b.question!=='string'||
    !b.question.trim()||b.question.length>400)return fail('QUESTION_INVALID',400);
  const question=b.question.trim();const turns=normalizeTurns(b.turns);
  let phase='database';
  try{
    const sql=mainSql();
    // One atomic rate-limit reservation on PRODUCTION Neon, never staging. No PII stored.
    const admission=await sql`SELECT public.dbk36_wa_ai_demo_admit(${staff.customerId}) AS allowed`;
    if(admission[0]?.allowed!==true)return fail('DEMO_DAILY_LIMIT_REACHED',429);
    phase='catalogue';
    const source=await getStoreProducts('ecommerce');
    const products=buildDemoCatalogue(source,question);
    if(!products.length)return fail('NO_AVAILABLE_CATALOGUE_ITEMS',503);
    phase='openai';
    const res=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:'gpt-4.1-mini',instructions:DEMO_INSTRUCTIONS,
        input:makeInput(question,turns,products),max_output_tokens:420,store:false}),
      signal:AbortSignal.timeout(28000),cache:'no-store',
    });
    if(!res.ok){
      // Never log credentials, customer messages, or the full provider response.
      let providerCode='unknown';
      try{
        const data=await res.json() as {error?:{code?:string;type?:string}};
        providerCode=data?.error?.code||data?.error?.type||'unknown';
      }catch{}
      console.error('DBK36_AI_PROVIDER_FAILURE',{status:res.status,code:providerCode,model:'gpt-4.1-mini'});
      return fail('AI_PROVIDER_TEMPORARILY_UNAVAILABLE',502);
    }
    phase='response';
    const answer=extractResponseText(await res.json() as unknown);
    // Only images from the real catalogue, never model-generated or arbitrary URLs.
    // Previously suggested products remain relevant when the customer asks for photos.
    const lower=answer.toLowerCase();
    const prior=turns.filter(t=>t.role==='assistant').slice(-2).map(t=>t.content.toLowerCase()).join(' ');
    const named=products.filter(item=>lower.includes(item.name.toLowerCase()));
    const candidates=named.length?named:/(photos?|pictures?|images?|show me)/i.test(question)
      ?products.filter(item=>prior.includes(item.name.toLowerCase())).slice(0,4):[];
    const shown=(candidates.length?candidates:named).slice(0,4);
    const productCards=shown.flatMap(item=>{
      const found=source.find(row=>row.id===item.id);
      const raw=found?.images?.[0]||found?.heroImage||'';
      let imageUrl:string|undefined;
      try{const u=new URL(raw);if(u.protocol==='https:'&&u.hostname==='cdn.sanity.io')imageUrl=u.toString();}
      catch{};
      if(!imageUrl)return [];
      const slug=typeof found?.slug==='string'?found.slug:'';
      return [{id:item.id,name:item.name,price:item.price,imageUrl,
        href:slug?'/shop/'+encodeURIComponent(slug):undefined}];
    });
    return NextResponse.json({answer,products:productCards,model:'gpt-4.1-mini',catalogueItemsConsidered:products.length,
      realAI:true,priceAndStockConfirmedAtCheckout:true,actionsPerformed:[]},{headers:HEADERS});
  }catch(e){
    // Never log customer messages, credentials, provider bodies, or raw SQL errors.
    console.error('DBK99_AI_DEMO_EXCEPTION',{phase,errorName:e instanceof Error?e.name:'Unknown'});
    return fail('AI_DEMO_TEMPORARILY_UNAVAILABLE',503);
  }
}
