import 'server-only';
import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {createProductionCheckout,payProductionCheckout,productionCustomerOrder,
  confirmProductionPickup,cancelProductionQuote} from '@/lib/db/dbk36-production-payments';
import {cleanError,maxProductionStkKes} from './dbk36-production-core';
import {relevantProducts,productImage,naturalCommand,contextualRequest,resolveShoppingProduct,type SalesProduct} from './dbk155-sales-core';
import {planShopping} from './dbk156-shopping-ai';

/** Native production-Neon WhatsApp chat. It deliberately does NOT import
 * staging browse-flow, cart-store, processor, or staging database helpers. */
export type SaleItem=SalesProduct;
const phone=/^254(?:7|1)\d{8}$/;
const bsuid=/^[A-Z]{2}\.[0-9]{6,32}$/;
const money=(n:number)=>`KES ${n.toLocaleString('en-KE',{maximumFractionDigits:2})}`;
const safe=(s:string)=>s.replace(/[\r\n*`]/g,' ').trim().slice(0,90);
type Answer={reply:string;images?:Array<{url:string;caption:string}>};
const reply=(text:string):Answer=>({reply:text});
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
    variants:r.variants===true||(Array.isArray(r.variants)&&r.variants.length>0),
    imageUrl:productImage(r,process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,process.env.NEXT_PUBLIC_SANITY_DATASET)};
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
  console.info('DBK156_CATALOGUE_REFRESH',{count:products.length,withImages:products.filter(p=>p.imageUrl).length});
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
export async function handleProductionChat(waId:string,rawText:string):Promise<Answer>{
  const bsuidOnly=bsuid.test(waId);
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES'||!(phone.test(waId)||bsuidOnly))
    throw new Error('PRODUCTION_CHAT_GATE_OFF');
  const text=rawText.trim().slice(0,500),db=sql();
  let cmd=naturalCommand(text);
  // Normal language never bypasses the existing quote > pickup > PAY checks.
  // Only explicit requests for a new payment prompt map to PAY.
  if(/^(PLEASE )?(SEND (ME )?(AN? )?)?(M-PESA|MPESA|STK) PUSH( NOW)?$/.test(cmd)||
     /^(PLEASE )?SEND (ME )?(AN? )?(M-PESA|MPESA|STK) (PAYMENT )?PROMPT( NOW)?$/.test(cmd)||
     cmd==='PAY NOW')cmd='PAY';
  if(['I WILL PICK UP','I WILL COLLECT','CONFIRM PICKUP','I CONFIRM PICKUP'].includes(cmd))cmd='PICKUP';
  if(['BUY THESE ITEMS','I WANT TO BUY THESE','I WANT TO PURCHASE THESE ITEMS',
      'PLACE MY ORDER','PROCEED TO CHECKOUT','I WANT TO CHECK OUT'].includes(cmd))cmd='CHECKOUT';
  // A BSUID is not a verified M-PESA phone number. Never let these sessions
  // read/create payment orders, confirm pickup or initiate an STK push.
  if(bsuidOnly&&['CHECKOUT','CHECK OUT','PICKUP','PAY','PAYMENT STATUS','MY ORDERS',
    'CANCEL CHECKOUT'].includes(cmd))
    return reply('Checkout and M-PESA require phone verification. Reply STAFF and our team will assist you.');
  if(/^(STAFF|HUMAN|HELP FROM STAFF)$/.test(cmd)){
    await db`UPDATE public.dbk36_wa_conversations SET mode='human',updated_at=now() WHERE wa_id=${waId}`;
    return reply('I’ve flagged this conversation for our team. They can assist you from here.');
  }
  const conversation=await db`SELECT mode FROM public.dbk36_wa_conversations WHERE wa_id=${waId}`;
  if(cmd==='BOT'){
    await db`UPDATE public.dbk36_wa_conversations SET mode='bot',updated_at=now() WHERE wa_id=${waId}`;
    return reply("Welcome back! What can I help you find today?");
  }
  if(conversation[0]?.mode==='human')return reply('A staff member will assist you. Reply BOT to return to automated shopping.');
  if(/^(MENU|HI|HELLO|START)$/.test(cmd)){
    const history=await db`SELECT id FROM public.dbk36_wa_messages WHERE wa_id=${waId} AND direction='in' AND status='done' LIMIT 1`;
    return reply(history.length?"Hi again! What can I help you find today?":"Hi, I am Kasiwa, your shopping assistant at Decor By Kasiwa! 😊 What are you looking for today?");
  }
  if(/^(DELIVERY QUOTE|QUOTE DELIVERY)$/.test(cmd)){if(!bsuidOnly)await cancelProductionQuote(waId);return reply('We can help arrange delivery. Our team needs to confirm the delivery cost before payment. Would you like me to flag this for them?');}
  const {products,fresh}=await catalogue();
  async function show(items:SaleItem[]):Promise<Answer>{
    if(!items.length){await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;return reply("I couldn't find a matching item in our catalogue. Could you describe what you're looking for a little more?");}
    await db`INSERT INTO public.dbk155_wa_shortlists(wa_id,product_ids) VALUES(${waId},${JSON.stringify(items.map(p=>p.id))}::jsonb)
      ON CONFLICT(wa_id) DO UPDATE SET product_ids=excluded.product_ids,updated_at=now()`;
    await db`INSERT INTO public.dbk36_wa_carts(wa_id,last_viewed_product_id) VALUES(${waId},${items[0].id})
      ON CONFLICT(wa_id) DO UPDATE SET last_viewed_product_id=excluded.last_viewed_product_id,updated_at=now()`;
    const label=(p:SaleItem,i:number)=>`${i+1}. ${safe(p.name)} — ${money(p.price)}${p.variants?' (options available)':''}\nhttps://decorbykasiwa.co.ke/shop/${encodeURIComponent(p.slug)}`;
    const images=items.flatMap((p,i)=>p.imageUrl?[{url:p.imageUrl,caption:label(p,i)}]:[]);
    console.info('DBK156_PRODUCT_MEDIA',{matched:items.length,withImages:images.length});
    const introduction=items.length===1?'I found this for you:':'These are the closest matches I found:';
    return {reply:introduction+'\n\n'+items.map(label).join('\n\n')+'\n\n'+(items.length===1?'Is this what you had in mind?':'Which one catches your eye?')+(images.length<items.length?'\nI don’t have a catalogue photo for every item right now.':''),images};
  }
  if(/^(SEARCH\s+.+|PRODUCTS|SHOP)$/.test(cmd)){
    if(!fresh)return reply('Our catalogue is refreshing. Please try again shortly.');
    return show(cmd==='PRODUCTS'||cmd==='SHOP'?products.filter(p=>p.stockQuantity!==0).slice(0,3):relevantProducts(cmd.replace(/^SEARCH\s+/i,''),products));
  }
  // Resolve selection against the last displayed shortlist only, not an LLM guess.
  const shortlist=async()=>{const rows=await db`SELECT product_ids FROM public.dbk155_wa_shortlists WHERE wa_id=${waId} AND updated_at>now()-interval '24 hours'`;
    const ids=rows[0]?.product_ids;
    return Array.isArray(ids)?ids.map(id=>products.find(p=>p.id===id)) as Array<SaleItem|undefined>:[];};
  const select=/^SELECT (\d{1,2})$/.exec(cmd);
  const named=/^(?:I WANT|I'LL TAKE|ADD|NATAKA) (.+)$/.exec(cmd);
  if(select||named&&!/^ADD \d+$/.test(cmd)&&!['ADD','CHECKOUT','DELIVERY QUOTE'].includes(cmd)){
    const options=await shortlist();const chosen=select?options[Number(select[1])-1]:options.find(p=>p?.name.toUpperCase()===named?.[1]);
    if(chosen){await db`UPDATE public.dbk36_wa_carts SET last_viewed_product_id=${chosen.id},updated_at=now() WHERE wa_id=${waId}`;cmd='ADD';}
    else if(select)return reply('Which product did you mean? Please choose one of the options I showed you.');
  }

  if(cmd==='CART'||cmd==='BASKET'||cmd==='MY CART'){
    const current=await cart(waId,products);
    if(!current.lines.length)return reply('Your cart is empty. What would you like to shop for?');
    return reply(current.lines.map((l,i)=>`${i+1}. ${safe(l.item.name)} × ${l.quantity} — ${money(l.subtotalMinor/100)}`).join('\n')+
      `\nTotal: ${money(current.totalMinor/100)}`+(current.invalid?'\nSome unavailable items were omitted.':'')+
      '\nWould you like to place your order, or change something?');
  }
  if(/^ADD(?:\s+\d+)?$/.test(cmd)){
    if(!fresh)return reply('Our catalogue needs refreshing before adding items. Reply STAFF.');
    const qty=Number(cmd.split(' ')[1]||1);if(!Number.isSafeInteger(qty)||qty<1||qty>20)return reply('Quantity must be between 1 and 20.');
    const options=await shortlist();
    if(!options.length)return reply('Please tell me which product you would like to add.');
    if(options.length>1&&!select&&!(named&&options.some(p=>p?.name.toUpperCase()===named[1])))return reply('Which of the options would you like? Please tell me its number or name.');
    const viewed=await db`SELECT last_viewed_product_id FROM public.dbk36_wa_carts WHERE wa_id=${waId}`;
    const item=products.find(x=>x.id===viewed[0]?.last_viewed_product_id);
    if(!item||!options.some(p=>p?.id===item.id)||item.stockQuantity===0)return reply('Which available product would you like?');
    if(item.variants)return reply(`Great choice! ${safe(item.name)} has options available. Our team needs to confirm the exact option before I can add it. Would you like to speak to the team?`);
    if(item.stockQuantity===null||item.stockQuantity<qty)return reply('I need to confirm stock before adding that quantity. Please choose a smaller quantity or ask for staff help.');
    if(!bsuidOnly)await cancelProductionQuote(waId);
    const up=await db`INSERT INTO public.dbk36_wa_cart_items(wa_id,product_id,quantity)
      VALUES(${waId},${item.id},${qty}) ON CONFLICT(wa_id,product_id) DO UPDATE
      SET quantity=public.dbk36_wa_cart_items.quantity+excluded.quantity,updated_at=now()
      WHERE public.dbk36_wa_cart_items.quantity+excluded.quantity<=LEAST(20,${item.stockQuantity??0}) RETURNING quantity`;
    return reply(up.length?`I've added ${qty} × ${safe(item.name)} to your cart. Would you like to keep shopping or place your order?`:'That quantity exceeds available stock. Would you like fewer?');
  }
  if(cmd==='CLEAR CART'){
    if(!bsuidOnly)await cancelProductionQuote(waId);
    await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}`;
    return reply('I’ve cleared your cart. What would you like to look for next?');
  }
  const rm=/^REMOVE (\d{1,2})$/.exec(cmd);
  if(rm){const c=await db`SELECT product_id FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}
    ORDER BY created_at ASC LIMIT 12`;const index=Number(rm[1])-1;
    if(index<0||index>=c.length)return reply('That cart item does not exist. Reply CART.');
    if(!bsuidOnly)await cancelProductionQuote(waId);
    await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId} AND product_id=${String(c[index].product_id)}`;
    return reply('I’ve removed that item. Would you like to review your cart?');
  }
  try{
    if(['CHECKOUT','CHECK OUT'].includes(cmd)){
      if(!fresh)return reply('Checkout is paused until the product catalogue refreshes. No payment requested.');
      const c=await cart(waId,products);
      if(!c.lines.length||c.invalid||c.totalMinor%100!==0||c.totalMinor<100||c.totalMinor>maxProductionStkKes()*100)
        return reply(c.totalMinor>maxProductionStkKes()*100?`Your total is ${money(c.totalMinor/100)}. Online WhatsApp payments currently support up to ${money(maxProductionStkKes())}. No payment has been requested. Our team can help you complete this order.`:'I need to confirm the items and price before checkout. No payment has been requested. Would you like staff assistance?');
      const ref='DBKWA'+randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
      const order=await createProductionCheckout({reference:ref,waId,amountKes:c.totalMinor/100,
        cart:c.lines.map(l=>({productId:l.item.id,variantId:'',quantity:l.quantity,subtotalMinor:l.subtotalMinor})),
        fulfillment:'pickup'});
      if(order.status!=='quoted')return reply('You already have a payment in progress. Please check its status before starting another order.');
      return reply(`Your order total is ${money(Number(order.amountKes))} (${order.reference}). Would you like to collect from our store? If you prefer delivery, our team can confirm the cost first.`);
    }
    if(cmd==='PICKUP'){
      const o=await confirmProductionPickup(waId);
      return reply(o?`Collection confirmed for ${o.reference}. Shall I send an M-PESA payment prompt for ${money(Number(o.amount_kes))} to your WhatsApp number? Please say “send M-PESA prompt” to confirm.`:'I need to prepare your order first. Would you like to check out?');
    }
    if(cmd==='PAY'){
      const o=await payProductionCheckout(waId);
      return reply(`I've requested an M-PESA prompt for ${money(o.amountKes)}. Please check your phone and enter your PIN only in the official M-PESA prompt. I'll only confirm payment once Safaricom verifies it.`);
    }
    if(cmd==='PAYMENT STATUS'||cmd==='MY ORDERS'){
      const o=await productionCustomerOrder(waId);
      if(!o)return reply('No order found. Reply CHECKOUT.');
      const status=String(o.status);
      return reply(status==='paid'?`Payment of ${money(Number(o.amount_kes))} for ${o.reference} has been verified. Our team will handle fulfilment.`:status==='prompt_sent'||status==='starting'||status==='review_required'?`Payment for ${o.reference} is awaiting confirmation. Please do not pay again until we verify it.`:status==='quoted'?`Your order ${o.reference} is awaiting payment. No payment has been confirmed.`:`Order ${o.reference} has no confirmed payment. Our team can help you check the next step.`);
    }
    if(cmd==='CANCEL CHECKOUT')return reply(await cancelProductionQuote(waId)?'Unpaid quote cancelled.':'No unpaid quote to cancel.');
  }catch(e){
    const code=cleanError(e);
    if(code.includes('OUTCOME_UNCERTAIN')||code.includes('ALREADY_IN_PROGRESS'))
      return reply('M-PESA status uncertain. Do not retry PAY. Reply PAYMENT STATUS or STAFF.');
    console.warn('DBK155_CHECKOUT_REVIEW',code);
    return reply('I couldn’t complete that step safely. Please do not send another payment request until our team checks it.');
  }
  const local=contextualRequest(text);
  if(local||process.env.DBK100_WA_AI_ENABLED==='YES'){
    const stored=await shortlist();
    // Do not renumber a stale shortlist. A missing entry invalidates the old selection.
    const options=stored.every(p=>p&&p.stockQuantity!==0)?stored as SaleItem[]:[];
    // The model receives a short history of customer utterances and verified shortlist names, never credentials or payment records.
    const recent=local?[]:await db`SELECT message_text FROM public.dbk36_wa_messages WHERE wa_id=${waId} AND direction='in' AND status='done' AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 4`;
    const plan=local||await planShopping(text,options,recent.map(r=>String(r.message_text||'')).reverse());
    if(plan?.intent==='search'){
      if(!fresh)return reply('I’m refreshing our catalogue. Could you try again shortly?');
      if(!plan.query)return reply('What kind of item are you looking for?');
      return show(relevantProducts(plan.query,products));
    }
    if(plan&&['photo','price','details'].includes(plan.intent)){
      if(!fresh)return reply('I need to refresh the catalogue before confirming that. Please try again shortly.');
      const chosen=resolveShoppingProduct(options,plan)||(!plan.option&&plan.query?resolveShoppingProduct(products,plan):undefined);
      if(!chosen){
        if(plan.intent==='photo'&&!plan.query&&!plan.option&&options.length>1)return show(options);
        return reply(options.length?`Which one did you mean — ${options.map(p=>safe(p.name)).join(', ')}?`:'Which product would you like to know more about?');
      }
      // Narrow the shortlist to the explicitly resolved product so the next "it"/"one" refers to the same item.
      if(plan.intent==='photo'||plan.intent==='details')return show([chosen]);
      await show([chosen]);
      return {reply:`${safe(chosen.name)} is listed at ${money(chosen.price)}${chosen.variants?' (options available)':''}. Would you like help choosing one?`,images:undefined};
    }
    if(plan?.intent==='clarify'||plan?.intent==='information'){
      // Informational answers are model-generated from approved knowledge, not authoritative transaction results.
      if(plan.message&&!/https?:|\b(?:pin|otp|password|paid|charged|refunded|reserved|added to|payment confirmed)\b|\b(?:KES|KSH)\s*\d/i.test(plan.message))return reply(plan.message);
    }
    // No arbitrary keyword search after a failed/ambiguous plan. Explicit search phrases may use a safe deterministic fallback.
    if(!plan&&fresh&&/^(?:do you have|i(?:'m| am) looking for|show me|find|search for|nataka|mnazo)\b/i.test(text))return show(relevantProducts(text,products));
    return reply(options.length===1?`Are you asking about ${safe(options[0].name)}? I can show you the photo, price or help you choose.`:'What would you like to find? I can also help you speak to our team.');
  }
  return reply("What product are you looking for, or would you like to speak to our team?");
}
