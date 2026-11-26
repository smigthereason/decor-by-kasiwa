import {NextRequest,NextResponse} from 'next/server';
import {neon} from '@neondatabase/serverless';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {normalizeTurns} from '@/lib/whatsapp/dbk36-ai-demo-core';
import {catalogueItem} from '@/lib/whatsapp/dbk36-production-chat';
import {planShopping} from '@/lib/whatsapp/dbk156-shopping-ai';
import {catalogueSku,shoppingBudget,budgetProducts,relevantProducts,type SalesProduct} from '@/lib/whatsapp/dbk155-sales-core';
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
    const products=source.map(catalogueItem).filter((p):p is SalesProduct=>p!==null && p.stockQuantity!==null && p.stockQuantity>0);
    if(!products.length)return fail('NO_AVAILABLE_CATALOGUE_ITEMS',503);
    const previous=turns.filter(t=>t.role==='assistant').at(-1)?.content.toLowerCase()||'';
    const options=products.filter(p=>previous.includes(p.name.toLowerCase())).slice(0,3);
    phase='openai';
    const plan=await planShopping(question,options,turns.map(t=>t.content));
    if(!plan)return fail('AI_PROVIDER_TEMPORARILY_UNAVAILABLE',502);
    let selected:SalesProduct[]=[];
    let answer='';
    const sku=catalogueSku(question),budget=shoppingBudget(question);
    if(sku)selected=relevantProducts(sku,products);
    else if(budget){
      const subject=question.split(/\b(?:under|below|less than|up to|at most|within|maximum)\b/i)[0].replace(/\b(?:what|are|can|you|show|me|i|would|like|to|buy|purchase|find|looking|for|some|any|the|a|cheap|cheapest|affordable|products?|items?|options?|anything|something|have|do|budget|please|is|there)\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').trim();
      selected=budgetProducts(subject?relevantProducts(subject,products,products.length):products,budget);
    }else if(plan.intent==='search')selected=relevantProducts(plan.query,products);
    else if(['photo','price','details'].includes(plan.intent)){
      selected=plan.query?relevantProducts(plan.query,products):plan.option>0?[options[plan.option-1]].filter(Boolean):options.length===1?options:[];
      if(!selected.length)answer='Which product would you like to know more about?';
    }else answer=plan.message||'What would you like help finding?';
    if(selected.length){
      answer=selected.map(p=>`${p.name} — KES ${p.price.toLocaleString('en-KE')}${p.variants?' (options available)':''}`).join('\n')+'\n'+(selected.length===1?'Is this what you had in mind?':'Which one catches your eye?');
    }else if(!answer)answer='I couldn’t find a confirmed in-stock item matching that request. Would you like to try another product or budget?';
    const productCards=selected.map(p=>({id:p.id,name:p.name,price:p.price,imageUrl:p.imageUrl||'',href:'/shop/'+encodeURIComponent(p.slug)}));
    return NextResponse.json({answer,products:productCards,model:'gpt-4.1-mini',catalogueItemsConsidered:products.length,
      realAI:true,priceAndStockConfirmedAtCheckout:true,actionsPerformed:[]},{headers:HEADERS});
  }catch(e){
    // Never log customer messages, credentials, provider bodies, or raw SQL errors.
    console.error('DBK99_AI_DEMO_EXCEPTION',{phase,errorName:e instanceof Error?e.name:'Unknown'});
    return fail('AI_DEMO_TEMPORARILY_UNAVAILABLE',503);
  }
}
