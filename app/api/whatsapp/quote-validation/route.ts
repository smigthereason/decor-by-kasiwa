import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStoreProducts } from '@/sanity/lib/catalog';
import { compareAuthoritativeQuote, validateQuoteRequest } from '@/lib/whatsapp/dbk36-stock-check-core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const deny=()=>NextResponse.json({valid:false},{status:403,headers});
/** Signed service-to-service ONLY. No anonymous stock data, no database writes. */
export async function POST(req:Request) {
  const env=process.env;
  const secret=env.DBK36_WA_LIVE_STOCK_SECRET||'';
  const storeId=env.DBK36_WA_STORE_LOCATION_ID||'';
  if(env.VERCEL_ENV!=='production'||env.DBK36_WA_STOCK_CHECK_ENABLED!=='YES'||
     secret.length<32||secret.length>512||!/^storeLocation\.[A-Za-z0-9]{20,100}$/.test(storeId))
    return NextResponse.json({valid:false,error:'NOT_CONFIGURED'},{status:503,headers});
  const tsText=req.headers.get('x-dbk36-quote-timestamp')||'';
  const signature=req.headers.get('x-dbk36-quote-signature')||'';
  if(!/^\d{10}$/.test(tsText)||!/^[a-f0-9]{64}$/.test(signature))return deny();
  const ts=Number(tsText);
  if(!Number.isSafeInteger(ts)||Math.abs(Date.now()/1000-ts)>45)return deny();
  const body=await req.text();
  if(Buffer.byteLength(body)>12000)return NextResponse.json({valid:false},{status:413,headers});
  const calculated=createHmac('sha256',secret).update(`${ts}.${body}`).digest();
  const supplied=Buffer.from(signature,'hex');
  if(supplied.length!==calculated.length||!timingSafeEqual(supplied,calculated))return deny();
  let raw:unknown;
  try {raw=JSON.parse(body);}catch{return NextResponse.json({valid:false},{status:400,headers});}
  const quote=validateQuoteRequest(raw);
  if(!quote)return NextResponse.json({valid:false},{status:400,headers});
  try {
    // Ecommerce published product price, location-specific authoritative stock.
    // The POS query is deliberately uncached and fails closed for ecommerce-only items.
    const [catalogue,stock]=await Promise.all([
      getStoreProducts('ecommerce'),getStoreProducts('pos',storeId),
    ]);
    const valid=compareAuthoritativeQuote(quote,catalogue,stock);
    return NextResponse.json({valid,reference:quote.reference,amountKes:quote.amountKes,
      availability:valid?'available':'unavailable',stockReserved:false},{headers});
  }catch{
    return NextResponse.json({valid:false,error:'STOCK_SOURCE_UNAVAILABLE'},
      {status:503,headers});
  }
}
