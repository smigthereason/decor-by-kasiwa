import 'server-only';
import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {createProductionCheckout,payProductionCheckout,productionCustomerOrder,
  confirmProductionPickup,cancelProductionQuote} from '@/lib/db/dbk36-production-payments';
import {cleanError} from './dbk36-production-core';

/** Native production-Neon WhatsApp chat. It deliberately does NOT import
 * staging browse-flow, cart-store, processor, or staging database helpers. */
export type SaleItem={id:string;name:string;slug:string;price:number;stockQuantity:number|null;variants:boolean};
const phone=/^254(?:7|1)\d{8}$/;
const money=(n:number)=>`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:2})}`;
const safe=(s:string)=>s.replace(/[\r\n*`]/g,' ').trim().slice(0,90);
const reply=(text:string)=>({reply:text});
const sql=()=>neon(process.env.DATABASE_URL!);
function catalogueItem(raw:unknown):SaleItem|null{
  if(!raw||typeof raw!=='object')return null;
  const r=raw as Record<string,unknown>;
  const id=String(r.id||r._id||''),name=String(r.name||r.title||''),slug=String(r.slug||'');
  const price=Number(r.price),stock=r.stockQuantity===null||r.stockQuantity===undefined?null:Number(r.stockQuantity);
  if(!id||id.length>180||!name||name.length>130||!slug||!Number.isFinite(price)||price<=0||
    !Number.isSafeInteger(Math.round(price*100))||Math.abs(Math.round(price*100)-price*100)>0.000001||
    r.available===false||r.ecommerceEnabled===false)return null;
  return {id,name,slug,price,stockQuantity:stock!==null&&Number.isSafeInteger(stock)&&stock>=0?stock:null,
    variants:Array.isArray(r.variants)&&r.variants.length>0};
}
export async function refreshProductionCatalogue(){
  if(process.env.DBK36_WA_PROD_CATALOGUE_SYNC_ENABLED!=='YES')throw new Error('CATALOGUE_GATE_OFF');
  const source=await getStoreProducts('ecommerce');
  if(!Array.isArray(source)||!source.length)throw new Error('EMPTY_SOURCE_KEEP_CURRENT_CACHE');
  const products:SaleItem[]=source.map(catalogueItem).filter((p):p is SaleItem=>p!==null);
  if(!products.length||products.length>20000)throw new Error('CATALOGUE_INVALID_KEEP_CURRENT_CACHE');
  const seen=new Set<string>();
  if(products.some(p=>{if(seen.has(p.id))return true;seen.add(p.id);return false}))
    throw new Error('CATALOGUE_DUPLICATE_IDS');
  const db=sql();
  const result=await db`INSERT INTO public.dbk36_wa_catalogue_cache(cache_key,products_json,synced_at)
    VALUES('ecommerce',${JSON.stringify(products)}::jsonb,now())
    ON CONFLICT(cache_key) DO UPDATE SET products_json=excluded.products_json,synced_at=excluded.synced_at
    RETURNING synced_at`;
  return {count:products.length,syncedAt:String(result[0]?.synced_at),mainNeon:true};
}
async function catalogue():Promise<{products:SaleItem[];fresh:boolean}>{
  const db=sql();const rows=await db`SELECT products_json,synced_at FROM public.dbk36_wa_catalogue_cache
    WHERE cache_key='ecommerce' LIMIT 1`;
  const row=rows[0];if(!row||!Array.isArray(row.products_json))return {products:[],fresh:false};
  const age=Date.now()-new Date(String(row.synced_at)).getTime();
  const products=(row.products_json as unknown[]).map(catalogueItem).filter((p):p is SaleItem=>p!==null);
  return {products, fresh:Number.isFinite(age)&&age>=0&&age<=60*60*1000&&products.length>0};
}
async function cart(waId:string,products:SaleItem[]){
  const db=sql();const rows=await db`SELECT product_id,quantity FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}
    ORDER BY created_at ASC LIMIT 12`;
  const byId=new Map(products.map(p=>[p.id,p]));const lines: Array<{item:SaleItem;quantity:number;subtotalMinor:number}>=[];
  let invalid=0;
  for(const r of rows){const p=byId.get(String(r.product_id)),quantity=Number(r.quantity);
    if(!p||!Number.isSafeInteger(quantity)||quantity<1||quantity>20||p.variants||
      (p.stockQuantity!==null&&p.stockQuantity<quantity)||
      !Number.isSafeInteger(Math.round(p.price*100))){invalid++;continue;}
    lines.push({item:p,quantity,subtotalMinor:Math.round(p.price*100)*quantity});
  }
  return {lines,invalid,totalMinor:lines.reduce((s,x)=>s+x.subtotalMinor,0)};
}
export async function handleProductionChat(waId:string,rawText:string):Promise<{reply:string}>{
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES'||!phone.test(waId))
    throw new Error('PRODUCTION_CHAT_GATE_OFF');
  const text=rawText.trim().slice(0,500),cmd=text.replace(/\s+/g,' ').toUpperCase(),db=sql();
  if(/^(STAFF|HUMAN|HELP FROM STAFF)$/.test(cmd)){
    await db`UPDATE public.dbk36_wa_conversations SET mode='human',updated_at=now() WHERE wa_id=${waId}`;
    return reply('Your request has been flagged for a Decor By Kasiwa team member. Please wait for a staff response.');
  }
  const conversation=await db`SELECT mode FROM public.dbk36_wa_conversations WHERE wa_id=${waId}`;
  if(cmd==='BOT'){
    await db`UPDATE public.dbk36_wa_conversations SET mode='bot',updated_at=now() WHERE wa_id=${waId}`;
    return reply('Welcome back. Reply MENU, SEARCH followed by a product name, or CART.');
  }
  if(conversation[0]?.mode==='human')return reply('A staff member will assist you. Reply BOT to return to automated shopping.');
  if(/^(MENU|HI|HELLO|START)$/.test(cmd))return reply('Welcome to Decor By Kasiwa! 🛍️\nSEARCH vase — find products\nADD — add last viewed product\nCART — review basket\nCHECKOUT — pickup quote\nPICKUP then PAY — M-PESA prompt\nDELIVERY QUOTE or STAFF — talk to our team.');
  if(/^(DELIVERY QUOTE|QUOTE DELIVERY)$/.test(cmd))return reply('Delivery needs a staff quote before payment. No M-PESA charge was requested. Reply STAFF.');
  const {products,fresh}=await catalogue();
  if(/^(SEARCH\s+.+|PRODUCTS|SHOP)$/.test(cmd)){
    if(!products.length)return reply('Our product catalogue is refreshing. Reply STAFF for help.');
    const term=cmd.replace(/^SEARCH\s*/,'').toLowerCase();
    const items=(cmd==='PRODUCTS'||cmd==='SHOP'?products:products.filter(p=>p.name.toLowerCase().includes(term))).slice(0,5);
    if(!items.length)return reply('No exact product matches. Try a shorter SEARCH term or reply STAFF.');
    await db`INSERT INTO public.dbk36_wa_carts(wa_id,last_viewed_product_id)
      VALUES(${waId},${items[0].id}) ON CONFLICT(wa_id) DO UPDATE
      SET last_viewed_product_id=excluded.last_viewed_product_id,updated_at=now()`;
    return reply(items.map((p,i)=>`${i+1}. ${safe(p.name)} — ${money(p.price)}\n${'https://decorbykasiwa.co.ke/shop/'+encodeURIComponent(p.slug)}`).join('\n\n')+
      '\n\nReply ADD to add the first result, or SEARCH another product. Prices and stock are checked again before payment.');
  }
  if(cmd==='CART'||cmd==='BASKET'||cmd==='MY CART'){
    const current=await cart(waId,products);
    if(!current.lines.length)return reply('Your cart is empty. Reply SEARCH vase, or MENU to browse.');
    return reply(current.lines.map((l,i)=>`${i+1}. ${safe(l.item.name)} × ${l.quantity} — ${money(l.subtotalMinor/100)}`).join('\n')+
      `\nTotal: ${money(current.totalMinor/100)}`+(current.invalid?'\nSome unavailable items were omitted.':'')+
      '\nREMOVE 1 | CLEAR CART | CHECKOUT');
  }
  if(/^ADD(?:\s+\d+)?$/.test(cmd)){
    if(!fresh)return reply('Our catalogue needs refreshing before adding items. Reply STAFF.');
    const qty=Number(cmd.split(' ')[1]||1);if(!Number.isSafeInteger(qty)||qty<1||qty>20)return reply('Quantity must be between 1 and 20.');
    const viewed=await db`SELECT last_viewed_product_id FROM public.dbk36_wa_carts WHERE wa_id=${waId}`;
    const item=products.find(x=>x.id===viewed[0]?.last_viewed_product_id);
    if(!item||item.variants||item.stockQuantity===0)return reply('Choose an available non-variant product through SEARCH first. For sizes or colours, reply STAFF.');
    const up=await db`INSERT INTO public.dbk36_wa_cart_items(wa_id,product_id,quantity)
      VALUES(${waId},${item.id},${qty}) ON CONFLICT(wa_id,product_id) DO UPDATE
      SET quantity=public.dbk36_wa_cart_items.quantity+excluded.quantity,updated_at=now()
      WHERE public.dbk36_wa_cart_items.quantity+excluded.quantity<=20 RETURNING quantity`;
    return reply(up.length?`${safe(item.name)} added (${qty}). Reply CART or CHECKOUT.`:'Maximum quantity reached. Reply CART.');
  }
  if(cmd==='CLEAR CART'){
    await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}`;
    return reply('Cart cleared. Reply SEARCH to start again.');
  }
  const rm=/^REMOVE (\d{1,2})$/.exec(cmd);
  if(rm){const c=await db`SELECT product_id FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}
    ORDER BY created_at ASC LIMIT 12`;const index=Number(rm[1])-1;
    if(index<0||index>=c.length)return reply('That cart item does not exist. Reply CART.');
    await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId} AND product_id=${String(c[index].product_id)}`;
    return reply('Item removed. Reply CART.');
  }
  try{
    if(['CHECKOUT','CHECK OUT'].includes(cmd)){
      if(!fresh)return reply('Checkout is paused until the product catalogue refreshes. No payment requested.');
      const c=await cart(waId,products);
      if(!c.lines.length||c.invalid||c.totalMinor%100!==0||c.totalMinor<100||c.totalMinor>50000)
        return reply('A pickup quote requires valid whole-KES items totaling KES 1–500. Reply CART or STAFF.');
      const ref='DBKWA'+randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
      const order=await createProductionCheckout({reference:ref,waId,amountKes:c.totalMinor/100,
        cart:c.lines.map(l=>({productId:l.item.id,variantId:'',quantity:l.quantity,subtotalMinor:l.subtotalMinor})),
        fulfillment:'pickup'});
      return reply(`Order ${order.reference}: ${money(Number(order.amountKes))}. Pickup only. Stock is not reserved. Reply PICKUP to confirm collection; then PAY for an M-PESA prompt.`);
    }
    if(cmd==='PICKUP'){
      const o=await confirmProductionPickup(waId);
      return reply(o?`Pickup confirmed for ${o.reference}. Reply PAY to request an M-PESA prompt.`:'No active pickup quote. Reply CHECKOUT.');
    }
    if(cmd==='PAY'){
      const o=await payProductionCheckout(waId);
      return reply(`STK prompt requested for ${o.reference}. Enter your PIN only on the official M-PESA prompt. Never retry PAY if the outcome is uncertain.`);
    }
    if(cmd==='PAYMENT STATUS'||cmd==='MY ORDERS'){
      const o=await productionCustomerOrder(waId);
      if(!o)return reply('No order found. Reply CHECKOUT.');
      return reply(`Order ${o.reference}: payment ${o.status}, stock ${o.stock_state}. Do not retry PAY if Safaricom may have charged you.`);
    }
    if(cmd==='CANCEL CHECKOUT')return reply(await cancelProductionQuote(waId)?'Unpaid quote cancelled.':'No unpaid quote to cancel.');
  }catch(e){
    const code=cleanError(e);
    if(code.includes('OUTCOME_UNCERTAIN')||code.includes('ALREADY_IN_PROGRESS'))
      return reply('M-PESA status uncertain. Do not retry PAY. Reply PAYMENT STATUS or STAFF.');
    return reply(`Checkout unavailable (${code}). No new charge should be attempted. Reply STAFF.`);
  }
  return reply('I can help you shop. Reply MENU, SEARCH followed by an item, CART, or STAFF.');
}
