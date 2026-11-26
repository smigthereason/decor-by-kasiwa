import 'server-only';
import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {createProductionCheckout,payProductionCheckout,productionCustomerOrder,
  confirmProductionPickup,cancelProductionQuote} from '@/lib/db/dbk36-production-payments';
import {cleanError} from './dbk36-production-core';
import {relevantProducts,catalogueSku,shoppingBudget,budgetProducts,productImage,naturalCommand,contextualRequest,resolveShoppingProduct,selectVariant,purchaseFollowup,type SalesProduct,type SalesVariant} from './dbk155-sales-core';
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
  const rawOptions=Array.isArray(r.variants)?r.variants:Array.isArray(r.variantOptions)?r.variantOptions:[];
  const variantOptions:SalesVariant[]=rawOptions.flatMap(value=>{
    if(!value||typeof value!=='object')return [];
    const v=value as Record<string,unknown>;
    const vid=typeof v.id==='string'?v.id:'';
    const label=String(v.label||[v.title,v.colour,v.size].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' / ')).trim();
    const vp=v.price==null?price:Number(v.price),vs=v.stockQuantity;
    if(!vid||vid.length>180||!label||label.length>130||!Number.isSafeInteger(Math.round(vp*100))||vp<=0||Math.abs(Math.round(vp*100)-vp*100)>0.000001)return [];
    return [{id:vid,label,price:vp,stockQuantity:typeof vs==='number'&&Number.isSafeInteger(vs)&&vs>=0?vs:null,imageUrl:productImage(v,process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,process.env.NEXT_PUBLIC_SANITY_DATASET)}];
  });
  return {id,name,slug,sku:typeof r.sku==='string'?r.sku:undefined,price,variantOptions,stockQuantity:stock!==null&&Number.isSafeInteger(stock)&&stock>=0?stock:null,
    variants:r.variants===true||rawOptions.length>0,
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
async function variantOptions(item:SaleItem):Promise<SalesVariant[]>{
  if(item.variantOptions?.length)return item.variantOptions;
  // Existing cache snapshots only store a boolean. Resolve once when needed, until next scheduled refresh.
  const live=(await getStoreProducts('ecommerce')).find(p=>p.id===item.id);
  return catalogueItem(live)?.variantOptions||[];
}
async function cart(waId:string,products:SaleItem[]){
  const db=sql();const rows=await db`SELECT product_id,quantity,variant_id FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}
    ORDER BY created_at ASC LIMIT 12`;
  const byId=new Map(products.map(p=>[p.id,p]));const lines: Array<{item:SaleItem;variantId:string;label:string;quantity:number;subtotalMinor:number}>=[];
  let invalid=0;
  for(const r of rows){const p=byId.get(String(r.product_id)),quantity=Number(r.quantity);
    if(!p||!Number.isSafeInteger(quantity)||quantity<1||quantity>20){invalid++;continue;}
    const vid=String(r.variant_id||'');
    const v=vid&&p.variants?(await variantOptions(p)).find(x=>x.id===vid):undefined;
    if((p.variants&&!v)||(!p.variants&&vid)){invalid++;continue;}
    const stock=v?v.stockQuantity:p.stockQuantity,price=v?v.price:p.price;
    if(stock===null||stock<quantity||!Number.isSafeInteger(Math.round(price*100))){invalid++;continue;}
    lines.push({item:p,variantId:vid,label:v?`${safe(p.name)} (${safe(v.label)})`:safe(p.name),quantity,subtotalMinor:Math.round(price*100)*quantity});
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
  if(/^(STAFF|HUMAN|HELP FROM STAFF)$/.test(cmd)||/^(?:CAN I|COULD I|MAY I|I WANT TO|I'D LIKE TO) (?:SPEAK|TALK) (?:TO|WITH) (?:A |THE )?(?:HUMAN|PERSON|STAFF|TEAM|SALES PERSON|AGENT|SOMEONE)$/.test(cmd)){
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
    await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=NULL,pending_variant_quantity=NULL,pending_variant_ids=NULL,pending_purchase_product_id=NULL,pending_purchase_stage=NULL WHERE wa_id=${waId}`;
    const history=await db`SELECT id FROM public.dbk36_wa_messages WHERE wa_id=${waId} AND direction='in' AND status='done' LIMIT 1`;
    return reply(history.length?"Hi again! What can I help you find today?":"Hi, I am Kasiwa, your shopping assistant at Decor By Kasiwa! 😊 What are you looking for today?");
  }
  if(/^(DELIVERY QUOTE|QUOTE DELIVERY)$/.test(cmd)){if(!bsuidOnly)await cancelProductionQuote(waId);return reply('We can help arrange delivery. Our team needs to confirm the delivery cost before payment. Would you like me to flag this for them?');}
  const {products,fresh}=await catalogue();
  const clearPending=async()=>{await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=NULL,pending_variant_quantity=NULL,pending_variant_ids=NULL WHERE wa_id=${waId} AND pending_variant_product_id IS NOT NULL`;};
  const clearPurchase=async()=>{await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=NULL,pending_purchase_stage=NULL WHERE wa_id=${waId} AND pending_purchase_stage IS NOT NULL`;};
  const describe=(item:SaleItem,options:SalesVariant[])=>({reply:`Great choice! ${safe(item.name)} has options:\n\n${options.map((v,i)=>`${i+1}. ${safe(v.label)} — ${money(v.price)}`).join('\n')}\n\nWhich would you like?`,images:options.flatMap((v,i)=>v.imageUrl?[{url:v.imageUrl,caption:`${i+1}. ${safe(v.label)} — ${money(v.price)}`}]:[])});
  async function addItem(item:SaleItem,qty:number,variant?:SalesVariant):Promise<Answer>{
    const stock=variant?variant.stockQuantity:item.stockQuantity;
    if(stock===null||stock<qty)return reply('That quantity is not currently confirmed in stock. Would you like another option?');
    if(!bsuidOnly)await cancelProductionQuote(waId);
    const vid=variant?.id||'';
    const up=await db`INSERT INTO public.dbk36_wa_cart_items(wa_id,product_id,quantity,variant_id)
      VALUES(${waId},${item.id},${qty},${vid}) ON CONFLICT(wa_id,product_id) DO UPDATE
      SET quantity=public.dbk36_wa_cart_items.quantity+excluded.quantity,updated_at=now()
      WHERE public.dbk36_wa_cart_items.variant_id=excluded.variant_id
        AND public.dbk36_wa_cart_items.quantity+excluded.quantity<=LEAST(20,${stock}) RETURNING quantity`;
    if(up.length)await clearPurchase();
    return reply(up.length?`I've added ${qty} × ${safe(item.name)}${variant?` (${safe(variant.label)})`:''} to your cart — ${money((variant?.price??item.price)*qty)}. Would you like to keep shopping or place your order?`:'That quantity is unavailable, or another option of this product is already in your cart. You can remove the existing item before choosing a different option.');
  }
  async function show(items:SaleItem[]):Promise<Answer>{
    await clearPending();
    await clearPurchase();
    if(!items.length){await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;return reply("I couldn't find a matching item in our catalogue. Could you describe what you're looking for a little more?");}
    await db`INSERT INTO public.dbk155_wa_shortlists(wa_id,product_ids) VALUES(${waId},${JSON.stringify(items.map(p=>p.id))}::jsonb)
      ON CONFLICT(wa_id) DO UPDATE SET product_ids=excluded.product_ids,updated_at=now()`;
    await db`INSERT INTO public.dbk36_wa_carts(wa_id,last_viewed_product_id) VALUES(${waId},${items[0].id})
      ON CONFLICT(wa_id) DO UPDATE SET last_viewed_product_id=excluded.last_viewed_product_id,updated_at=now()`;
    if(items.length===1)await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${items[0].id},pending_purchase_stage='offer',updated_at=now() WHERE wa_id=${waId}`;
    const label=(p:SaleItem,i:number)=>`${i+1}. ${safe(p.name)} — ${money(p.price)}${p.variants?' (options available)':''}\nhttps://decorbykasiwa.co.ke/shop/${encodeURIComponent(p.slug)}`;
    const images=items.flatMap((p,i)=>p.imageUrl?[{url:p.imageUrl,caption:label(p,i)}]:[]);
    console.info('DBK156_PRODUCT_MEDIA',{matched:items.length,withImages:images.length});
    const introduction=items.length===1?'I found this for you:':'These are the closest matches I found:';
    return {reply:introduction+'\n\n'+items.map(label).join('\n\n')+'\n\n'+(items.length===1?'Is this what you had in mind?':'Which one catches your eye?')+(images.length<items.length?'\nI don’t have a catalogue photo for every item right now.':''),images};
  }
  // Explicit catalogue and budget lookups are read-only, not payment commands.
  const sku=catalogueSku(text);
  const budget=shoppingBudget(text);
  const directQuery=/^(?:what (?:of|about)|i(?:'|’)d like to (?:purchase|buy)|id like to (?:purchase|buy)|i (?:want|would like) to (?:purchase|buy)|do you have|i(?:'m| am) looking for|search for|find)\s+(.+)$/i.exec(text)?.[1];
  if(sku||budget){
    if(!fresh)return reply('Our catalogue is refreshing. Please try again shortly.');
    if(sku)return show(relevantProducts(sku,products));
    if(budget){
      // A named category in a budget request must not return unrelated products.
      const subject=text.split(/\b(?:under|below|less than|up to|at most|within|maximum)\b/i)[0].replace(/\b(?:what|are|can|you|show|me|i|would|like|to|buy|purchase|find|looking|for|some|any|the|a|cheap|cheapest|affordable|products?|items?|options?|anything|something|have|do|budget|please|is|there)\b/gi,' ').replace(/[^a-z0-9 ]/gi,' ').trim();
      const candidates=subject?relevantProducts(subject,products,products.length):products;
      const found=budgetProducts(candidates,budget);
      if(!found.length){await clearPending();await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;return reply('I couldn’t find a confirmed in-stock item matching that budget. Would you like to try another amount or product?');}
      return show(found);
    }
  }
  if(directQuery&&fresh&&/^(?:what (?:of|about)|i(?:['’])?d like to (?:purchase|buy)|i (?:want|would like) to (?:purchase|buy))\s+/i.test(text)){
    const matched=relevantProducts(directQuery,products);if(matched.length)return show(matched);
  }
  if(/^(SEARCH\s+.+|PRODUCTS|SHOP)$/.test(cmd)){
    if(!fresh)return reply('Our catalogue is refreshing. Please try again shortly.');
    return show(cmd==='PRODUCTS'||cmd==='SHOP'?products.filter(p=>p.stockQuantity!==0).slice(0,3):relevantProducts(cmd.replace(/^SEARCH\s+/i,''),products));
  }
  // Resolve selection against the last displayed shortlist only, not an LLM guess.
  const shortlist=async()=>{const rows=await db`SELECT product_ids FROM public.dbk155_wa_shortlists WHERE wa_id=${waId} AND updated_at>now()-interval '24 hours'`;
    const ids=rows[0]?.product_ids;
    return Array.isArray(ids)?ids.map(id=>products.find(p=>p.id===id)) as Array<SaleItem|undefined>:[];};
  const pendingRows=await db`SELECT pending_variant_product_id,pending_variant_quantity,pending_variant_ids FROM public.dbk155_wa_shortlists WHERE wa_id=${waId} AND pending_variant_product_id IS NOT NULL AND updated_at>now()-interval '15 minutes'`;
  const pending=pendingRows[0];
  if(pending){
    const item=products.find(p=>p.id===pending.pending_variant_product_id);
    const qty=Number(pending.pending_variant_quantity);
    if(!fresh||!item||!item.variants||!Number.isInteger(qty)||qty<1||qty>20){await clearPending();return reply('I need to refresh the product options. Please search for the item again.');}
    const all=await variantOptions(item);
    const ids:unknown[]=Array.isArray(pending.pending_variant_ids)?pending.pending_variant_ids:[];
    const shown=ids.map(id=>all.find(v=>v.id===id));
    if(!shown.length||shown.some(v=>!v||v.stockQuantity===null||v.stockQuantity<qty)){await clearPending();return reply('The available options have changed. Please choose the product again so I can check current stock.');}
    const options=shown as SalesVariant[];
    if(/^(?:CANCEL|NEVER MIND|NO THANKS|CLEAR CART|CANCEL CHECKOUT)$/.test(cmd)){await clearPending();if(!['CLEAR CART','CANCEL CHECKOUT'].includes(cmd))return reply('No problem. What else can I help you find?');}
    else if(/^(?:SEARCH\s+.+|PRODUCTS|SHOP)$/.test(cmd)||/^(?:do you have|i(?:'m| am) looking for|search for|find)\b/i.test(text)){await clearPending();}
    else if(!['CART','BASKET','MY CART','PAYMENT STATUS','MY ORDERS'].includes(cmd)){
      if(['PAY','CHECKOUT','CHECK OUT','PICKUP'].includes(cmd))return reply('Please choose the product option first. No payment has been requested.');
      const chosen=selectVariant(text,options);
      if(chosen){
        // Atomically consume the selection to avoid adding the same pending choice twice.
        const claimed=await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=NULL,pending_variant_quantity=NULL,pending_variant_ids=NULL WHERE wa_id=${waId} AND pending_variant_product_id=${item.id} AND pending_variant_quantity=${qty} AND pending_variant_ids=${JSON.stringify(ids)}::jsonb AND updated_at>now()-interval '15 minutes' RETURNING wa_id`;
        if(!claimed.length)return reply('That option is no longer pending. Please choose the product again.');
        return addItem(item,qty,chosen);
      }
      if(/\b(?:why|confirm|staff|team)\b/i.test(text))return reply('I just need to know which option you prefer so I can check the right price and stock. '+describe(item,options).reply);
      return describe(item,options);
    }
  }
  // Confirmation and quantity are separate states, scoped to the last displayed product.
  // An affirmative response never enters checkout or PAY.
  const purchase=purchaseFollowup(text);
  if(purchase){
    const rows=await db`SELECT pending_purchase_product_id,pending_purchase_stage FROM public.dbk155_wa_shortlists WHERE wa_id=${waId} AND pending_purchase_stage IS NOT NULL AND updated_at>now()-interval '15 minutes'`;
    const state=rows[0];
    if(state){
      const item=products.find(p=>p.id===state.pending_purchase_product_id);
      if(purchase.kind==='reject'){await clearPurchase();await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;return reply('No problem. What would you prefer instead?');}
      if(!fresh||!item||item.stockQuantity===0){await clearPurchase();return reply('Let me check the current catalogue first. Could you tell me the product again?');}
      if(purchase.kind==='accept'){
        await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId} AND pending_purchase_product_id=${item.id}`;
        return reply('Perfect! How many would you like?');
      }
      // Bare numbers at the offer stage still select a listed option (legacy UI).
      if(state.pending_purchase_stage==='quantity'||!/^[0-9]{1,2}$/.test(text)){
        const qty=purchase.quantity!;
        if(!Number.isSafeInteger(qty)||qty<1||qty>20)return reply('How many would you like? Please choose a quantity between 1 and 20.');
        const options=await shortlist();
        if(options.length!==1||options[0]?.id!==item.id){await clearPurchase();return reply('Which product would you like?');}
        await db`UPDATE public.dbk36_wa_carts SET last_viewed_product_id=${item.id},updated_at=now() WHERE wa_id=${waId}`;
        cmd='ADD '+qty;
      }
    }else if(purchase.kind==='reject'){return reply('No problem. What would you prefer instead?');}
    else if(purchase.kind==='accept'||(purchase.kind==='quantity'&&!/^SELECT \d{1,2}$/.test(cmd)&&!/^ADD(?: \d+)?$/.test(cmd))){return reply('Which product would you like? I can help you choose or place your order.');}
  }
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
    return reply(current.lines.map((l,i)=>`${i+1}. ${l.label} × ${l.quantity} — ${money(l.subtotalMinor/100)}`).join('\n')+
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
    if(item.variants){
      const options=(await variantOptions(item)).filter(v=>v.stockQuantity!==null&&v.stockQuantity>=qty).slice(0,8);
      if(!options.length)return reply(`Great choice! ${safe(item.name)} has options, but I can’t verify stock for that quantity right now. Would you like to choose another item or speak to our team?`);
      await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=${item.id},pending_variant_quantity=${qty},pending_variant_ids=${JSON.stringify(options.map(v=>v.id))}::jsonb,updated_at=now() WHERE wa_id=${waId}`;
      await clearPurchase();
      return describe(item,options);
    }
    return addItem(item,qty);
  }
  if(cmd==='CLEAR CART'){
    await clearPurchase();await clearPending();await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;
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
      await clearPurchase();
      if(!fresh)return reply('Checkout is paused until the product catalogue refreshes. No payment requested.');
      const c=await cart(waId,products);
      if(!c.lines.length||c.invalid||c.totalMinor%100!==0||c.totalMinor<100||!Number.isSafeInteger(c.totalMinor))
        return reply('I need to confirm the items and price before checkout. No payment has been requested. Would you like staff assistance?');
      const ref='DBKWA'+randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
      const order=await createProductionCheckout({reference:ref,waId,amountKes:c.totalMinor/100,
        cart:c.lines.map(l=>({productId:l.item.id,variantId:l.variantId,quantity:l.quantity,subtotalMinor:l.subtotalMinor})),
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
      const matched=relevantProducts(plan.query,products);
      return show(matched.length?matched:directQuery?relevantProducts(directQuery,products):[]);
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
    if(directQuery&&fresh&&(!plan||plan.intent==='clarify'||plan.intent==='information')){const matched=relevantProducts(directQuery,products);if(matched.length)return show(matched);}
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
