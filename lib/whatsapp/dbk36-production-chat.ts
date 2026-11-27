import 'server-only';
import {neon} from '@neondatabase/serverless';
import {randomUUID} from 'node:crypto';
import {getStoreProducts} from '@/sanity/lib/catalog';
import {promotionCacheKey} from '../dbk164-promotion-server';
import {whatsappPromotionPrice,type PriceableProduct} from '../product-pricing';
import {createProductionCheckout,payProductionCheckout,productionCustomerOrder,
  confirmProductionPickup,cancelProductionQuote,selectProductionPayer,suspendProductionPickup} from '@/lib/db/dbk36-production-payments';
import {cleanError} from './dbk36-production-core';
import {explicitPaperSizes,relevantProducts,catalogueSku,shoppingBudget,budgetProducts,productImage,naturalCommand,contextualRequest,resolveShoppingProduct,selectVariant,purchaseFollowup,type SalesProduct,type SalesVariant} from './dbk155-sales-core';
import {planShopping,suggestDeliveryCounty} from './dbk156-shopping-ai';
import {checkoutIntent,wantsCheckout,wantsSelectedPurchase,paymentAssent,deliveryLocation,knownCounty,counties,DELIVERY_QUESTION} from './dbk165-checkout-intent';
import {getPublishedKnowledge} from './dbk155-knowledge';
import {countyDeliveryFee,payerNumber,alternatePayerRequest,PAYER_INPUT,displayPayer,deliveryTiming} from './dbk178-policy';
import {namedOrderRequest,namedOrderCandidates,parseDeliveryContext,deliveryMethod} from './dbk167-order-context';
import {cartIntent,cartTarget,CART_CHOICE,paymentStatusIntent,glueSearchPage} from './dbk176-cart-intent';
import {compareCataloguePhotos,type VisualLookup} from './dbk166-inbound-media';
import {wantsHuman,frustratedAutomation,wholesaleEnquiry,pointerOnly,NO_MATCH,previousMiss,cleanProductQuery,groupedMatches,visualCatalogueMatches} from './dbk166-sales-recovery';

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
export function catalogueItem(raw:unknown):SaleItem|null{
  if(!raw||typeof raw!=='object')return null;
  const r=raw as Record<string,unknown>;
  const id=String(r.id||r._id||''),name=String(r.name||r.title||''),slug=String(r.slug||'');
  const price=whatsappPromotionPrice(r as PriceableProduct),stock=r.stockQuantity===null||r.stockQuantity===undefined?null:Number(r.stockQuantity);
  if(!id||id.length>180||!name||name.length>130||!slug||!Number.isFinite(price)||price<=0||
    !Number.isSafeInteger(Math.round(price*100))||Math.abs(Math.round(price*100)-price*100)>0.000001||
    r.available===false||r.ecommerceEnabled===false)return null;
  const rawOptions=Array.isArray(r.variants)?r.variants:Array.isArray(r.variantOptions)?r.variantOptions:[];
  const variantOptions:SalesVariant[]=rawOptions.flatMap(value=>{
    if(!value||typeof value!=='object')return [];
    const v=value as Record<string,unknown>;
    const vid=typeof v.id==='string'?v.id:'';
    const label=String(v.label||[v.title,v.colour,v.size].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' / ')).trim();
    const vp=whatsappPromotionPrice(r as PriceableProduct,v.price==null?undefined:Number(v.price)),vs=v.stockQuantity;
    if(!vid||vid.length>180||!label||label.length>130||!Number.isSafeInteger(Math.round(vp*100))||vp<=0||Math.abs(Math.round(vp*100)-vp*100)>0.000001)return [];
    return [{id:vid,label,price:vp,stockQuantity:typeof vs==='number'&&Number.isSafeInteger(vs)&&vs>=0?vs:null,imageUrl:productImage(v,process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,process.env.NEXT_PUBLIC_SANITY_DATASET)}];
  });
  return {id,name,slug,sku:typeof r.sku==='string'?r.sku:undefined,price,variantOptions,stockQuantity:stock!==null&&Number.isSafeInteger(stock)&&stock>=0?stock:null,
    variants:r.variants===true||rawOptions.length>0,
    imageUrl:productImage(r,process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,process.env.NEXT_PUBLIC_SANITY_DATASET)};
}
export async function refreshProductionCatalogue(){
  if(process.env.DBK36_WA_PROD_CATALOGUE_SYNC_ENABLED!=='YES')throw new Error('CATALOGUE_GATE_OFF');
  const epoch=promotionCacheKey();
  const source=await getStoreProducts('ecommerce');
  if(!Array.isArray(source)||!source.length)throw new Error('EMPTY_SOURCE_KEEP_CURRENT_CACHE');
  const products:SaleItem[]=source.map(catalogueItem).filter((p):p is SaleItem=>p!==null);
  if(!products.length||products.length>20000)throw new Error('CATALOGUE_INVALID_KEEP_CURRENT_CACHE');
  const seen=new Set<string>();
  if(products.some(p=>{if(seen.has(p.id))return true;seen.add(p.id);return false}))
    throw new Error('CATALOGUE_DUPLICATE_IDS');
  if(epoch!==promotionCacheKey())throw new Error('PROMOTION_BOUNDARY_RETRY');
  const db=sql();
  const result=await db`INSERT INTO public.dbk36_wa_catalogue_cache(cache_key,products_json,synced_at)
    VALUES('ecommerce',${JSON.stringify(products.map(p=>({...p,promotionEpoch:epoch})))}::jsonb,now())
    ON CONFLICT(cache_key) DO UPDATE SET products_json=excluded.products_json,synced_at=excluded.synced_at
    RETURNING synced_at`;
  console.info('DBK156_CATALOGUE_REFRESH',{count:products.length,withImages:products.filter(p=>p.imageUrl).length});
  console.info('DBK177_GLUE_REFRESH',{source:source.filter(p=>/glue\s*sticks?/i.test(p.name)).length, cached:products.filter(p=>/glue\s*sticks?/i.test(p.name)).length, available:relevantProducts('glue sticks',products,products.length).length});
  return {count:products.length,syncedAt:String(result[0]?.synced_at),mainNeon:true};
}
async function catalogue():Promise<{products:SaleItem[];fresh:boolean}>{
  const db=sql();const read=()=>db`SELECT products_json,synced_at FROM public.dbk36_wa_catalogue_cache
    WHERE cache_key='ecommerce' LIMIT 1`;
  let row=(await read())[0];
  if(!row||!Array.isArray(row.products_json))return {products:[],fresh:false};
  const matches=(value:unknown,epoch:string)=>Array.isArray(value)&&value.length>0&&value.every(p=>p&&typeof p==='object'&&(p.promotionEpoch??'off')===epoch);
  if(!matches(row.products_json,promotionCacheKey())){
    try{await refreshProductionCatalogue();row=(await read())[0];}
    catch{console.warn('DBK164_PROMOTION_CACHE_REFRESH_REQUIRED');return {products:[],fresh:false};}
    if(!row||!matches(row.products_json,promotionCacheKey()))return {products:[],fresh:false};
  }
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
    ORDER BY created_at ASC,product_id ASC LIMIT 12`;
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
function cartSummary(c:Awaited<ReturnType<typeof cart>>){return 'Current cart:\n'+c.lines.map((l,i)=>`${i+1}. ${l.label} × ${l.quantity} — ${money(l.subtotalMinor/100)}`).join('\n')+`\nCart total: ${money(c.totalMinor/100)}`+(c.invalid?'\nSome items require a stock check before checkout.':'');}
export async function handleProductionChat(waId:string,rawText:string,visual?:VisualLookup):Promise<Answer>{
  const bsuidOnly=bsuid.test(waId);
  if(process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED!=='YES'||!(phone.test(waId)||bsuidOnly))
    throw new Error('PRODUCTION_CHAT_GATE_OFF');
  const text=rawText.trim().slice(0,500),db=sql();
  const checkoutWords=!visual&&wantsCheckout(text);
  const purchaseWords=!visual&&wantsSelectedPurchase(text);
  let cmd=visual?'VISUAL':checkoutWords?'CHECKOUT':checkoutIntent(text,waId)||naturalCommand(text);
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
  if(bsuidOnly&&(['CHECKOUT','CHECK OUT','PICKUP','PAY','PAYMENT STATUS','MY ORDERS',
    'CANCEL CHECKOUT','PAY_PHONE','PAY_OTHER_PHONE'].includes(cmd)||(!visual&&alternatePayerRequest(text))))
    return reply('Checkout and M-PESA require phone verification. Reply STAFF and our team will assist you.');
  if(!visual&&(wantsHuman(text)||/^(STAFF|HUMAN|HELP FROM STAFF)$/.test(cmd)||/^(?:CAN I|COULD I|MAY I|I WANT TO|I'D LIKE TO) (?:SPEAK|TALK) (?:TO|WITH) (?:A |THE )?(?:HUMAN|PERSON|STAFF|TEAM|SALES PERSON|AGENT|SOMEONE)$/.test(cmd))){
    await db`UPDATE public.dbk36_wa_conversations SET mode='human',updated_at=now() WHERE wa_id=${waId}`;
    return reply('Of course. I’ve handed this chat to our sales team. They’ll pick up from here when available.');
  }
  const conversation=await db`SELECT mode,delivery_context,staff_review_reason FROM public.dbk36_wa_conversations WHERE wa_id=${waId}`;
  const flagReview=async(reason:string)=>{await db`UPDATE public.dbk36_wa_conversations SET staff_review_reason=CASE WHEN staff_review_reason='Wholesale enquiry' THEN staff_review_reason ELSE ${reason} END,updated_at=now() WHERE wa_id=${waId}`;};
  const clearDelivery=async()=>{await db`UPDATE public.dbk36_wa_conversations SET delivery_context=NULL,staff_review_reason=CASE WHEN staff_review_reason='Delivery quote' THEN NULL ELSE staff_review_reason END,updated_at=now() WHERE wa_id=${waId} AND delivery_context IS NOT NULL`;};
  let deliveryContext=parseDeliveryContext(conversation[0]?.delivery_context);
  if(cmd==='BOT'){
    await db`UPDATE public.dbk36_wa_conversations SET mode='bot',updated_at=now() WHERE wa_id=${waId}`;
    return reply("Welcome back! What can I help you find today?");
  }
  if(conversation[0]?.mode==='human')return reply('A staff member will assist you. Reply BOT to return to automated shopping.');
  if(!visual&&frustratedAutomation(text)){
    await flagReview('Customer needs assistance');
    return reply('Yes, I’m Kasiwa, the automated shopping assistant. Sorry for the back and forth. I’ve flagged this chat for our sales team, and I can still help with other enquiries while you wait.');
  }
  if(!visual&&wholesaleEnquiry(text)){
    await flagReview('Wholesale enquiry');
    return reply('Absolutely, our sales team can confirm wholesale pricing for resale. I’ve flagged this chat for them. How many pieces are you looking for? You can keep asking me about our products while you wait.');
  }
  if(/^(MENU|HI|HELLO|START)$/.test(cmd)){
    await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=NULL,pending_variant_quantity=NULL,pending_variant_ids=NULL,pending_purchase_product_id=NULL,pending_purchase_stage=NULL WHERE wa_id=${waId}`;
    const history=await db`SELECT id FROM public.dbk36_wa_messages WHERE wa_id=${waId} AND direction='in' AND status='done' LIMIT 1`;
    return reply(history.length?"Hi again! What can I help you find today?":"Hi, I am Kasiwa, your shopping assistant at Decor By Kasiwa! 😊 What are you looking for today?");
  }
  if(cmd==='PAY'&&(/[?]/.test(text)||/\b(?:do not|don't|never|cancel|stop)\b/i.test(text)))return reply('I can send a prompt after you confirm your order and collection. No new payment has been requested.');
  let cachedPreviousReply:string|undefined;
  const previousReply=async()=>{
    if(cachedPreviousReply!==undefined)return cachedPreviousReply;
    try{const rows=await db`SELECT message_text FROM public.dbk159_wa_outbound WHERE wa_id=${waId} AND actor_id='AI' AND status='accepted' AND image_url IS NULL AND created_at>now()-interval '15 minutes' ORDER BY created_at DESC,request_id DESC LIMIT 1`;
    return cachedPreviousReply=String(rows[0]?.message_text||'');}catch{return cachedPreviousReply='';}
  };
  // Payment status reads durable state only. Do not turn a status request into
  // provider polling or an STK. A draft cancellation cannot cancel a submitted payment.
  const paymentStatus=async():Promise<Answer>=>{
    if(bsuidOnly)return reply('Payment status requires phone verification. Our team can assist.');
    const o=await productionCustomerOrder(waId);
    if(!o)return reply('No payment order found. You can place a new order.');
    const status=String(o.status),ref=String(o.reference),amount=money(Number(o.amount_kes));
    if(status==='paid')return reply(`Payment of ${amount} for ${ref} has been verified. Our team will handle fulfilment.`);
    if(['starting','prompt_sent','review_required'].includes(status)){
      await flagReview('Payment initiation');
      return reply(`Payment for ${ref} (${amount}) is awaiting confirmation. Please do not pay again until we verify it. I’ve flagged it for our team. Clearing your cart does not cancel this payment.`);
    }
    if(status==='quoted'){
      if(new Date(String(o.expires_at)).getTime()<=Date.now()){await cancelProductionQuote(waId);return reply(`Unpaid quote ${ref} has expired and is cancelled. You can place a new order.`);}
      return reply(`Order ${ref} (${amount}) is an unpaid quote. No payment prompt has been sent for this quote. Reply CANCEL CHECKOUT to cancel it or continue checkout.`);
    }
    if(status==='failed'||status==='cancelled')return reply(`Order ${ref} is ${status}. You can review your cart and place a new order. No new payment has been requested.`);
    return reply(`Payment for ${ref} requires staff review. Please do not pay again.`);
  };
  if(!visual&&(cmd==='PAYMENT STATUS'||cmd==='MY ORDERS'||paymentStatusIntent(text)||(/^check it for me[.!]?$/i.test(text)&&(await previousReply()).startsWith('Payment for '))))return paymentStatus();
  if(!visual&&cmd==='CANCEL CHECKOUT'){
    await clearDelivery();
    if(await cancelProductionQuote(waId))return reply('Unpaid quote cancelled. Your cart is unchanged.');
    return paymentStatus();
  }
  let basketAction=!visual?cartIntent(text):null;
  if(!visual&&!basketAction&&/^(?:all|all items|everything|all of them)[.!]?$/i.test(text))basketAction=cartIntent(text,await previousReply());
  if(basketAction?.kind==='choose')return reply(CART_CHOICE);
  const resetCartChoices=async()=>{await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;};
  const paymentCartWarning=async()=>{
    if(bsuidOnly)return '';
    const o=await productionCustomerOrder(waId);
    if(o&&['starting','prompt_sent','review_required'].includes(String(o.status))){await flagReview('Payment initiation');return `\nExisting payment ${o.reference} (${money(Number(o.amount_kes))}) is still being checked. Cart changes do not alter that payment.`;}
    return '';
  };
  if(basketAction?.kind==='clear'){
    if(!bsuidOnly)await cancelProductionQuote(waId);
    await clearDelivery();await resetCartChoices();
    await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId}`;
    return reply('I’ve cleared your cart. It is now empty. Tell me what you’d like to shop for next.'+await paymentCartWarning());
  }
  // Consent is valid only for the current quote and the immediately preceding,
  // server-generated payment question, never an AI-generated offer.
  const paymentQuestion=(o:{reference:unknown;amount_kes:unknown;payer_phone?:unknown})=>{
    const payer=String(o.payer_phone??waId);
    return payer===waId
      ?`Collection confirmed for ${o.reference}. Shall I send an M-PESA payment prompt for ${money(Number(o.amount_kes))} to your WhatsApp number? Say “send M-PESA prompt”${process.env.DBK178_ALTERNATE_PAYER_ENABLED==='YES'?' or “use another number”':''}.`
      :`Collection confirmed for ${o.reference}. Shall I send an M-PESA payment prompt for ${money(Number(o.amount_kes))} to ${displayPayer(payer)}? Please ensure the phone owner agrees. Say “send M-PESA prompt” or “use another number”.`;
  };
  let expectedPayment:{reference:string;payer:string}|undefined;
  const useOwn=!visual&&/^(?:use (?:my|this|the) (?:whatsapp )?number|use my whatsapp|same number|this number)[.!]?$/i.test(text);
  const awaitingPayer=!visual&&!bsuidOnly&&!basketAction&&!/^(?:SEARCH\b|PRODUCTS$|SHOP$|PICKUP$|CHECKOUT$|CHECK OUT$)/.test(cmd)&&await previousReply()===PAYER_INPUT;
  if(!visual&&!bsuidOnly&&(awaitingPayer||cmd==='PAY_OTHER_PHONE'||cmd==='PAY_PHONE'||alternatePayerRequest(text)||useOwn||cmd==='PAY'||paymentAssent(text))){
    const last=await previousReply();
    const selecting=alternatePayerRequest(text)||useOwn||cmd==='PAY_OTHER_PHONE'||last===PAYER_INPUT;
    const order=await productionCustomerOrder(waId);
    const active=order&&['starting','prompt_sent','review_required'].includes(String(order.status));
    if(active&&(selecting||cmd==='PAY'||cmd==='PAY_PHONE'))return paymentStatus();
    const ready=order?.status==='quoted'&&order.pickup_confirmed_at&&new Date(String(order.expires_at)).getTime()>Date.now()&&!deliveryContext;
    if(selecting||(cmd==='PAY_PHONE'&&ready)){
      if(conversation[0]?.staff_review_reason==='Wholesale enquiry')return reply('Our team needs to confirm your wholesale rate first.');
      if(!ready||!order)return reply('Please confirm your order and collection method before choosing the payment number.');
      if(process.env.DBK178_ALTERNATE_PAYER_ENABLED!=='YES'&&!useOwn&&cmd!=='PAY_PHONE')return reply('Alternative M-PESA numbers are temporarily handled by our sales team. You can use your WhatsApp number instead.');
      if(alternatePayerRequest(text))return reply(PAYER_INPUT);
      const payer=useOwn?waId:payerNumber(text);
      if(!payer||(awaitingPayer&&!useOwn&&!/^(?:\+?254|0)[17](?:[ -]?\d){8}$/.test(text.trim())))return reply(PAYER_INPUT);
      try{return reply(paymentQuestion(await selectProductionPayer(waId,String(order.reference),payer) as {reference:unknown;amount_kes:unknown;payer_phone?:unknown}));}
      catch{return reply('I could not update the payment number safely. Please review your order or ask our team for help.');}
    }
    if(ready&&order&&(cmd==='PAY'||paymentAssent(text))){
      const payer=String(order.payer_phone??waId);
      if(last===paymentQuestion(order as {reference:unknown;amount_kes:unknown;payer_phone?:unknown})){
        expectedPayment={reference:String(order.reference),payer};cmd='PAY';
      }else if(cmd==='PAY')return reply(paymentQuestion(order as {reference:unknown;amount_kes:unknown;payer_phone?:unknown}));
    }
  }
  // A yes to the exact server-generated cart question opens a quote, never an STK.
  if(!visual&&!bsuidOnly&&paymentAssent(text)&&cmd!=='PAY'){
    const last=await previousReply();
    if(last.startsWith("I've added " )&&last.includes('Would you like to place your order?'))cmd='CHECKOUT';
    else if(last.startsWith('Your order total is '))return reply('Would you prefer store collection or delivery?');
    else if(last.startsWith('Delivery options for '))return reply('Would you prefer standard delivery, store collection or a rider quote?');
  }
  // A published timing policy is informational; it does not promise an order-specific date.
  if(!visual&&/\b(?:deliver(?:y|ed)?|shipping)\b/i.test(text)&&/\b(?:how long|how soon|when|delivery time|how many days|timeline|takes?)\b/i.test(text)&&!/(?:order|my parcel|track|tracking)\b/i.test(text)){
    const timing=deliveryTiming((await getPublishedKnowledge()).delivery);
    if(timing)return reply(timing);
  }
  // Standard rates come from published knowledge; settlement still requires staff.

  const deliveryCommand=!visual&&(/^(DELIVERY QUOTE|QUOTE DELIVERY)$/.test(cmd)||/^(?:(?:i (?:want|need|prefer|would like)|nataka|naomba) )?delivery(?: please)?[.!]?$/i.test(text));
  const lastForLocation=!visual&&!deliveryCommand&&/^[\p{L}][\p{L}\s.'’,-]{0,69}$/u.test(text)?await previousReply():'';
  const suggested=/^Is your delivery county (.+) County\? Please confirm\.$/.exec(lastForLocation);
  const confirmedCounty=suggested&&paymentAssent(text)&&counties.includes(suggested[1])?suggested[1]:null;
  const bareLocation=deliveryLocation(text,true);
  const countyUpdate=/^(?:add|set|change|update)(?: to)?(?: my)?(?: delivery)?(?: location| county)?(?: to)?\s+(.+?)(?: to my delivery location(?: for my order)?)?$/i.exec(text);
  const repeatedCounty=!!deliveryContext&&!!bareLocation&&!!knownCounty(bareLocation)&&counties.includes(knownCounty(bareLocation)!);
  const awaitingCounty=lastForLocation===DELIVERY_QUESTION||lastForLocation.startsWith('I couldn’t identify that town')||lastForLocation.startsWith('Please confirm the town or area and its correct county')||lastForLocation.startsWith('Which county should I use for ')||lastForLocation.endsWith('Please also share your specific town or area and county.')||!!suggested||((lastForLocation.startsWith('Your order total is ')||lastForLocation==='Would you prefer store collection or delivery?')&&!!bareLocation);
  let location=visual?null:confirmedCounty||(deliveryContext&&countyUpdate&&knownCounty(countyUpdate[1])?countyUpdate[1]:null)||deliveryLocation(text,(awaitingCounty||repeatedCounty)&&!['PICKUP','PAY','CHECKOUT','PAY_PHONE','PAY_OTHER_PHONE'].includes(cmd));
  if(!visual&&deliveryContext&&/^(?:add to county|change county|update county|set county)[.!]?$/i.test(text))return reply('Which county should I use for '+safe(deliveryContext.location)+'?');
  if(location&&deliveryContext&&!location.includes(',')&&counties.includes(knownCounty(location)||'')&&(/county$/i.test(location)||counties.some(c=>c.toLowerCase()===location!.toLowerCase()))){
    const c=knownCounty(location)!;
    if(deliveryContext.location!=='Delivery address pending'&&(!deliveryContext.county||deliveryContext.county===c))location=deliveryContext.location+', '+c;
  }
  const method=!visual&&deliveryContext?.county?deliveryMethod(text):null;
  const referencedDelivery=!!location&&/^(?:i (?:want|need|would like)|nataka) (?:these|those|this|them|hizi|hizo)\b/i.test(text);
  if(deliveryCommand||location||method){
    if(!bsuidOnly){
      const o=await productionCustomerOrder(waId);
      if(o&&['starting','prompt_sent','review_required'].includes(String(o.status)))return reply('Your payment is still being checked. Please do not pay again. Our team can help with delivery once the payment status is confirmed.');
      if(o?.status==='quoted'&&o.pickup_confirmed_at&&!await suspendProductionPickup(waId,String(o.reference)))return paymentStatus();
    }
    if(method&&deliveryContext){
      deliveryContext={...deliveryContext,method};
      await db`UPDATE public.dbk36_wa_conversations SET delivery_context=${JSON.stringify(deliveryContext)}::jsonb,staff_review_reason=CASE WHEN staff_review_reason='Wholesale enquiry' THEN staff_review_reason ELSE 'Delivery quote' END,updated_at=now() WHERE wa_id=${waId}`;
      return reply(`I’ve flagged your ${safe(method)} request for ${safe(deliveryContext.location)} for our team to confirm the final fee and total. You can keep shopping or choose collection instead. No payment has been requested.`);
    }
    if(!location){
      if(!deliveryContext){deliveryContext={location:'Delivery address pending',county:''};await db`UPDATE public.dbk36_wa_conversations SET delivery_context=${JSON.stringify(deliveryContext)}::jsonb,updated_at=now() WHERE wa_id=${waId}`;}
      return reply(DELIVERY_QUESTION);
    }
    const county=knownCounty(location);
    if(!county){
      if(location.includes(',')){deliveryContext={location:location.split(',')[0].trim(),county:''};await db`UPDATE public.dbk36_wa_conversations SET delivery_context=${JSON.stringify(deliveryContext)}::jsonb,updated_at=now() WHERE wa_id=${waId}`;return reply('Please confirm the town or area and its correct county, e.g. Kikuyu, Kiambu. No delivery fee has been confirmed.');}
      deliveryContext={location,county:''};
      await db`UPDATE public.dbk36_wa_conversations SET delivery_context=${JSON.stringify(deliveryContext)}::jsonb,updated_at=now() WHERE wa_id=${waId}`;
      if(/^thika$/i.test(location))return reply('Please confirm the town or area and its correct county: Kiambu or Muranga for Thika.');
      const suggestion=await suggestDeliveryCounty(location,counties);
      return reply(suggestion?`Is your delivery county ${suggestion} County? Please confirm.`:'I couldn’t identify that town confidently. Which county is it in?');
    }
    const resolvedLocation=location.split(',')[0].trim();
    deliveryContext={location:resolvedLocation,county,...(deliveryContext?.county===county&&deliveryContext.location.toLowerCase()===resolvedLocation.toLowerCase()&&deliveryContext.method?{method:deliveryContext.method}:{})};
    await db`UPDATE public.dbk36_wa_conversations SET delivery_context=${JSON.stringify(deliveryContext)}::jsonb,staff_review_reason=CASE WHEN staff_review_reason='Wholesale enquiry' THEN staff_review_reason WHEN ${!!deliveryContext.method} THEN 'Delivery quote' WHEN staff_review_reason='Delivery quote' THEN NULL ELSE staff_review_reason END,updated_at=now() WHERE wa_id=${waId}`;
    const knowledge=await getPublishedKnowledge();
    const fee=countyDeliveryFee(knowledge.delivery,county);
    const rate=fee===null?'No fixed rate confirmed in our published delivery policy.':`Standard delivery — ${money(fee)}`;
    if(referencedDelivery)await flagReview('Photo and delivery request');
    return reply((referencedDelivery?'Please confirm the products and quantity of each item so our team can prepare the correct order. No items have been added from the photos alone.\n\n':'')+`Delivery options for ${safe(deliveryContext.location)}${deliveryContext.location.toLowerCase()===county.toLowerCase()?'':` (${county} County)`}:\n${rate}\nStore collection — free\nYou can also ask our team for a rider quote. Which would you prefer? Our team will confirm delivery cost and final total before payment.${location.toLowerCase()===county.toLowerCase()?' Please also share your specific town or area and county.':''}`);
  }

  const {products,fresh}=await catalogue();
  if(basketAction){
    const rows=await db`SELECT product_id,quantity,variant_id FROM public.dbk36_wa_cart_items WHERE wa_id=${waId} ORDER BY created_at ASC,product_id ASC LIMIT 12`;
    const entries=rows.map((r,i)=>{
      const p=products.find(x=>x.id===r.product_id),v=p?.variantOptions?.find(x=>x.id===r.variant_id);
      return {position:i+1,id:String(r.product_id),label:p?`${safe(p.name)}${v?` (${safe(v.label)})`:r.variant_id?' (option unavailable)':''}`:'Unavailable catalogue item',quantity:Number(r.quantity)};
    });
    const display=async()=>{
      const current=await cart(waId,products);
      return entries.length?'Current cart:\n'+entries.map(e=>{const line=current.lines.find(l=>l.item.id===e.id);return `${e.position}. ${e.label} × ${e.quantity}${line&&fresh?' — '+money(line.subtotalMinor/100):' — needs stock/price check'}`;}).join('\n')+(fresh&&!current.invalid?`\nCart total: ${money(current.totalMinor/100)}`:'\nTotal requires current stock and price confirmation.'):'Your cart is empty.';
    };
    if(basketAction.kind==='view')return reply(await display()+'\nTo change items, say “remove item 1” or “clear cart”. To buy, say “I want to pay”.'+await paymentCartWarning());
    const selected=cartTarget(basketAction.target||'',entries);
    if(selected===null)return reply('I couldn’t identify one cart item. Please specify its number.\n'+await display());
    const target=entries.find(e=>e.position===selected)!;
    if(!bsuidOnly)await cancelProductionQuote(waId);
    await resetCartChoices();
    if(basketAction.kind==='keep')await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId} AND product_id<>${target.id}`;
    else await db`DELETE FROM public.dbk36_wa_cart_items WHERE wa_id=${waId} AND product_id=${target.id}`;
    const updated=await cart(waId,products);
    return reply((basketAction.kind==='keep'?`I’ve kept only ${target.label} in your cart.`:`I’ve removed ${target.label} from your cart.`)+'\n'+(updated.lines.length?cartSummary(updated):updated.invalid?'Remaining items need a stock check.':'Your cart is empty.')+'\nSay “show my cart” to review it, or “I want to pay” when ready.'+await paymentCartWarning());
  }
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
    if(!up.length)return reply('That quantity is unavailable, or another option of this product is already in your cart. You can remove the existing item before choosing a different option.');
    await clearPurchase();
    const c=await cart(waId,products);
    return reply(`I've added ${qty} × ${safe(item.name)}${variant?` (${safe(variant.label)})`:''} to your cart — ${money((variant?.price??item.price)*qty)}.\n\n${cartSummary(c)}\nWould you like to place your order? Say “I want to pay”, “show my cart”, or “remove item 1”.`);
  }
  async function show(items:SaleItem[]):Promise<Answer>{
    await clearPending();
    await clearPurchase();
    if(!items.length){
      await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;
      if(previousMiss(await previousReply())){
        await flagReview('Product search');
        return reply('Sorry, I’m still not finding the right item. I’ve flagged this conversation for our sales team. I can still help with other products while you wait.');
      }
      return reply(NO_MATCH+' Could you share the product name or describe its design? I can also connect you with our sales team.');
    }
    await db`INSERT INTO public.dbk155_wa_shortlists(wa_id,product_ids) VALUES(${waId},${JSON.stringify(items.map(p=>p.id))}::jsonb)
      ON CONFLICT(wa_id) DO UPDATE SET product_ids=excluded.product_ids,updated_at=now()`;
    await db`INSERT INTO public.dbk36_wa_carts(wa_id,last_viewed_product_id) VALUES(${waId},${items[0].id})
      ON CONFLICT(wa_id) DO UPDATE SET last_viewed_product_id=excluded.last_viewed_product_id,updated_at=now()`;
    if(items.length===1)await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${items[0].id},pending_purchase_stage='offer',updated_at=now() WHERE wa_id=${waId}`;
    const label=(p:SaleItem,i:number)=>`${i+1}. ${safe(p.name)} — ${money(p.price)}${conversation[0]?.staff_review_reason==='Wholesale enquiry'?' (retail)':''}${p.variants?' (options available)':''}\nhttps://decorbykasiwa.co.ke/shop/${encodeURIComponent(p.slug)}`;
    const images=items.flatMap((p,i)=>p.imageUrl?[{url:p.imageUrl,caption:label(p,i)}]:[]);
    console.info('DBK156_PRODUCT_MEDIA',{matched:items.length,withImages:images.length});
    const introduction=items.length===1?'I found this for you:':'These are the closest matches I found:';
    return {reply:introduction+'\n\n'+items.map(label).join('\n\n')+'\n\n'+(items.length===1?'Is this what you had in mind? To buy, say “I want this” or tell me the quantity.':'Which one catches your eye? Reply with its number or name to choose.')+(images.length<items.length?'\nI don’t have a catalogue photo for every item right now.':''),images};
  }
  async function showSearch(query:string):Promise<Answer>{
    const {items,missing,groups}=groupedMatches(query,products);
    const result=await show(items);
    if(groups.length>1&&items.length){
      // A partial or multi-product result is not consent to add any item.
      await clearPurchase();
      return {...result,reply:result.reply.replace(/Is this what you had in mind\?|Which one catches your eye\?/, 'Which item would you like to choose first?')+(missing.length?'\nI haven’t confirmed a match for: '+missing.map(safe).join(', ')+'. Our team can check those for you.':'')};
    }
    return result;
  }
  // Visual suggestions are strictly read-only. Never pass model output or an
  // image caption through the normal cart or payment command parser.
  if(visual){
    let matched=visual.imageUrl?products.filter(p=>p.stockQuantity!==0&&(p.imageUrl===visual.imageUrl||p.variantOptions?.some(v=>v.imageUrl===visual.imageUrl))).slice(0,3):visual.query?visualCatalogueMatches(visual.query,products,8):[];
    if(visual.image&&fresh)matched=await compareCataloguePhotos(visual.image,matched);
    else matched=matched.slice(0,3);
    if(!fresh||!matched.length){
      await clearPending();await clearPurchase();
      await db`DELETE FROM public.dbk155_wa_shortlists WHERE wa_id=${waId}`;
      await flagReview('Photo matching');
      return reply('I couldn’t confirm the item from the photo or referenced message. Could you share its product name or size? I’ve flagged this chat for our sales team. You can keep asking about other products while you wait.');
    }
    const result=await show(matched);
    return {...result,reply:'Here are catalogue options that may match the photo. Please confirm the exact product before we add anything to your cart.\n\n'+result.reply};
  }
  const namedOrder=['CHECKOUT','CHECK OUT','PICKUP','PAY','PAY_PHONE','PAY_OTHER_PHONE','ADD'].includes(cmd)||/^ADD \d+$/.test(cmd)?null:namedOrderRequest(text);
  const wholesaleReview=conversation[0]?.staff_review_reason==='Wholesale enquiry';
  if(wholesaleReview&&!visual&&/^(?:retail|retail please|i want retail|buy at retail|i prefer retail)$/i.test(text)){
    await db`UPDATE public.dbk36_wa_conversations SET staff_review_reason=NULL,updated_at=now() WHERE wa_id=${waId} AND staff_review_reason='Wholesale enquiry'`;
    return reply('Retail pricing confirmed. What would you like to order?');
  }
  if(wholesaleReview&&!visual&&(namedOrder||['PAY','PAY_PHONE','PICKUP','CHECKOUT','CHECK OUT'].includes(cmd)||/^ADD(?: |$)/.test(cmd)||purchaseFollowup(text)?.kind==='quantity'||purchaseFollowup(text)?.kind==='accept'))return reply('Our team needs to confirm your wholesale rate and quantities first. I can still show catalogue products at retail prices. If you want to order at retail instead, tell me “retail please”. No payment has been requested.');
  const namedAdd=/^(?:please )?add (?:the |a |an )?(.+?) to (?:my |the )?cart[.!]?$/i.exec(text);
  if(namedAdd&&!visual){
    if(wholesaleReview)return reply('Our team needs to confirm wholesale pricing first. Reply “retail please” if you want retail prices.');
    if(!fresh)return reply('I need to refresh the catalogue before adding items.');
    const candidates=relevantProducts(namedAdd[1],products,products.length);
    if(candidates.length!==1)return show(candidates.slice(0,3));
    const selected=await show(candidates);
    await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId} AND pending_purchase_product_id=${candidates[0].id}`;
    return {...selected,reply:`How many ${safe(candidates[0].name)} would you like?`};
  }
  if(namedOrder){
    if(!fresh)return reply('I need to refresh the catalogue before confirming your order. No payment has been requested.');
    const matches=namedOrderCandidates(namedOrder.query,products);
    if(matches.length!==1)return show(matches.slice(0,3));
    const item=matches[0];
    const qty=namedOrder.quantity;
    if(qty!==undefined&&(!Number.isSafeInteger(qty)||qty<1||qty>20))return reply('Please choose a quantity between 1 and 20.');
    const result=await show([item]);
    if(qty===undefined){
      await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId} AND pending_purchase_product_id=${item.id}`;
      return {reply:`${safe(item.name)} — ${money(item.price)}. How many would you like?`,images:result.images};
    }
    if(item.variants){
      const options=(await variantOptions(item)).filter(v=>v.stockQuantity!==null&&v.stockQuantity>=qty).slice(0,8);
      if(!options.length)return reply('I can’t confirm stock for the requested option and quantity. Our team can check it for you.');
      await db`UPDATE public.dbk155_wa_shortlists SET pending_variant_product_id=${item.id},pending_variant_quantity=${qty},pending_variant_ids=${JSON.stringify(options.map(v=>v.id))}::jsonb,updated_at=now() WHERE wa_id=${waId}`;
      await clearPurchase();
      return describe(item,options);
    }
    return addItem(item,qty);
  }
  // A named payment request is a purchase enquiry, not permission to charge
  // an existing quote for an unrelated item.
  const namedPayment=/^(?:i (?:want|would like|need) to|i['’]d like to|let me) pay for (?:the |a |an )?(.+?)[.!]?$/i.exec(text);
  if(namedPayment&&!['PAY','CHECKOUT'].includes(cmd)&&!text.includes('?')){
    if(!fresh)return reply('I’m refreshing the catalogue before confirming your order. No payment has been requested.');
    const matched=relevantProducts(namedPayment[1],products);
    if(matched.length!==1)return show(matched);
    const result=await show(matched);
    await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId} AND pending_purchase_product_id=${matched[0].id}`;
    return {reply:`${safe(matched[0].name)} — ${money(matched[0].price)}. How many would you like? I’ll confirm the order total before requesting payment.`,images:result.images};
  }
  const gluePage=visual?null:glueSearchPage(text);
  if(gluePage!==null){
    if(!fresh)return reply('Our catalogue is refreshing. Please try again shortly.');
    const all=relevantProducts('glue sticks',products,products.length).filter(p=>p.variants?(p.variantOptions||[]).some(v=>v.stockQuantity!==null&&v.stockQuantity>0):p.stockQuantity!==null&&p.stockQuantity>0);
    const size=10,pages=Math.max(1,Math.ceil(all.length/size));
    if(gluePage>pages)return reply(`There are ${pages} page(s) of glue sticks. Reply “glue sticks” to start again.`);
    const result=await show(all.slice((gluePage-1)*size,gluePage*size));
    if(all.length<=1)console.info('DBK177_GLUE_CATALOGUE_COVERAGE',{matching:all.length,cached:products.length});
    return all.length?{...result,reply:`Available glue sticks (${all.length} catalogue products, page ${gluePage}/${pages}):\n\n`+result.reply+(all.length===1?'\nThis is the only matching in-stock item in my current shopping catalogue. Our team can check other stock.':'')+(gluePage<pages?`\nReply “glue sticks page ${gluePage+1}” for more.`:'')}:result;
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
  // Exact paper sizes are never dropped by the language model.
  if(fresh&&!visual&&explicitPaperSizes(text).length&&!/\b(?:pay|payment|mpesa|stk|cart|checkout|order|cancel|deliver|delivery|refund|remove|add|not|don't|dont|no|except)\b/i.test(text)){
    const query=(directQuery||text).replace(/^(?:show me|show|search|find|i want|i need|nataka|do you have)\s+/i,'').replace(/\b(?:please|ones?)\b/gi,' ').trim();
    return showSearch(query);
  }
  // Size-specific glue stick requests must never substitute an unrelated size.
  if(fresh&&!visual&&/\b\d+(?:\.\d+)?\s*mm\b/i.test(text)&&/\bglue\s*sticks?\b/i.test(text)&&!/\b(?:pay|payment|mpesa|stk|cart|checkout|order|cancel|deliver|delivery|refund|remove|add|not|don't|dont|no|except)\b/i.test(text))return showSearch(directQuery||text.replace(/^search\s+/i,''));
  if(directQuery&&fresh&&/^(?:what (?:of|about)|i(?:['’])?d like to (?:purchase|buy)|i (?:want|would like) to (?:purchase|buy))\s+/i.test(text)){
    const matched=relevantProducts(directQuery,products);if(matched.length)return show(matched);
  }
  if(fresh&&!/\b(?:pay|payment|mpesa|stk|cart|checkout|order|cancel|deliver|delivery|refund|remove|add|not|don't|dont|no|except)\b/i.test(text)){
    const {items,groups}=groupedMatches(text,products);
    if(items.length&&(groups.length>1||/\b(?:vace|vaces|donate|knotted|ni how much|bei gani|bei ngapi)\b/i.test(text)||/^(?:need|nataka|naomba)\s+/i.test(text)))return showSearch(text);
  }
  if(/^(SEARCH\s+.+|PRODUCTS|SHOP)$/.test(cmd)){
    if(!fresh)return reply('Our catalogue is refreshing. Please try again shortly.');
    return cmd==='PRODUCTS'||cmd==='SHOP'?show(products.filter(p=>p.stockQuantity!==0).slice(0,3)):showSearch(cmd.replace(/^SEARCH\s+/i,''));
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
      if(['PAY','PAY_PHONE','CHECKOUT','CHECK OUT','PICKUP'].includes(cmd))return reply('Please choose the product option first. No payment has been requested.');
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
  if(purchaseWords&&cmd!=='PAY'){
    const c=await cart(waId,products);
    const options=(await shortlist()).filter((p):p is SaleItem=>!!p&&p.stockQuantity!==0);
    if(c.lines.length&&(!options.length||options.length===1&&c.lines.some(l=>l.item.id===options[0].id))){cmd='CHECKOUT';}
    else if(options.length===1&&fresh){
      await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${options[0].id},pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId}`;
      return reply(`How many ${safe(options[0].name)} would you like?`);
    }
    else if(options.length>1)return reply('Which product would you like to buy? Reply with its number or name.');
    else if(c.lines.length)cmd='CHECKOUT';
    else return reply('Tell me the product you would like to buy and the quantity.');
  }
  const purchase=['PAY','CHECKOUT','CHECK OUT','PICKUP'].includes(cmd)?null:purchaseFollowup(text);
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
  try{
    if(deliveryContext&&['PAY','PAY_PHONE','CHECKOUT','CHECK OUT'].includes(cmd)){
      if(!bsuidOnly){const o=await productionCustomerOrder(waId);if(o&&['starting','prompt_sent','review_required'].includes(String(o.status)))return paymentStatus();}
      const c=await cart(waId,products),knowledge=await getPublishedKnowledge();
      const fee=deliveryContext.method&&/rider/i.test(deliveryContext.method)?null:countyDeliveryFee(knowledge.delivery,deliveryContext.county);
      await flagReview('Delivery quote');
      const estimate=fresh&&c.lines.length&&!c.invalid&&fee!==null?`\nProducts: ${money(c.totalMinor/100)}\nDelivery: ${money(fee)}\nEstimated total: ${money(c.totalMinor/100+fee)}`:'';
      return reply(`Your delivery request is for ${safe(deliveryContext.location)}${deliveryContext.county?' ('+safe(deliveryContext.county)+')':''}.${estimate} Our team will confirm the delivery cost and final total before payment. You can choose store collection instead. No new payment has been requested.`);
    }
    if(cmd==='PAY_PHONE'){
      const o=await productionCustomerOrder(waId);
      if(o&&['starting','prompt_sent','review_required'].includes(String(o.status)))return reply('Your payment is still being checked. Please don’t pay again.');
      if(o?.status==='quoted'&&o.pickup_confirmed_at&&new Date(String(o.expires_at)).getTime()>Date.now())return reply(paymentQuestion(o as {reference:unknown;amount_kes:unknown}));
      if(o?.status==='quoted'&&new Date(String(o.expires_at)).getTime()>Date.now())return reply(`Your order total is ${money(Number(o.amount_kes))} (${o.reference}). Will you collect from our store, or would you prefer delivery?`);
      const c=await cart(waId,products);
      if(c.lines.length)return reply('Thanks! I’ll use your WhatsApp number. Would you like to place your order so I can confirm the total?');
      const options=await shortlist();
      if(fresh&&options.length===1&&options[0]){
        await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${options[0].id},pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId}`;
        return reply(`Thanks! I’ll use your WhatsApp number. How many ${safe(options[0].name)} would you like?`);
      }
      return reply('Thanks! I’ll use your WhatsApp number once we confirm your order. What would you like to buy?');
    }
    if(cmd==='PAY'){
      const order=await productionCustomerOrder(waId);
      if(order&&['starting','prompt_sent','review_required'].includes(String(order.status)))return reply(`Payment for ${order.reference} is awaiting confirmation. Please do not pay again.`);
      if(order?.status==='paid')return reply(`Payment for ${order.reference} has already been verified. Please don’t pay again. If you want a new order, tell me what you would like to buy.`);
      if(!order||order.status!=='quoted'||new Date(String(order.expires_at)).getTime()<=Date.now()){
        const c=await cart(waId,products);
        if(!c.lines.length){
          const options=await shortlist();
          if(options.length===1&&options[0]&&fresh){
            await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${options[0].id},pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId}`;
            return reply(`How many ${safe(options[0].name)} would you like? I’ll confirm your total before requesting payment.`);
          }
          return reply('What would you like to buy? I’ll confirm your order and total before requesting payment.');
        }
        cmd='CHECKOUT'; // create a quote, never send STK from this branch
      }else if(!order.pickup_confirmed_at){
        return reply(`Your order total is ${money(Number(order.amount_kes))} (${order.reference}). Will you collect from our store, or would you prefer delivery? No payment has been requested.`);
      }
    }
    if(['CHECKOUT','CHECK OUT','PICKUP'].includes(cmd)){
      if(bsuidOnly)return reply('Checkout and M-PESA require phone verification. Reply STAFF and our team will assist you.');
      if(checkoutWords){
        const o=await productionCustomerOrder(waId);
        if(o&&['starting','prompt_sent','review_required'].includes(String(o.status)))return paymentStatus();
        if(o?.status==='quoted'&&o.pickup_confirmed_at&&new Date(String(o.expires_at)).getTime()>Date.now())return reply(paymentQuestion(o as {reference:unknown;amount_kes:unknown}));
        const c=await cart(waId,products);
        if(!c.lines.length){const options=(await shortlist()).filter((p):p is SaleItem=>!!p&&p.stockQuantity!==0);if(fresh&&options.length===1){await db`UPDATE public.dbk155_wa_shortlists SET pending_purchase_product_id=${options[0].id},pending_purchase_stage='quantity',updated_at=now() WHERE wa_id=${waId}`;return reply(`How many ${safe(options[0].name)} would you like? I’ll confirm your order before payment.`);}return reply('What would you like to buy? Tell me the product and quantity first.');}
      }
      await clearPurchase();
      if(!fresh)return reply('Checkout is paused until the product catalogue refreshes. No payment requested.');
      const c=await cart(waId,products);
      if(!c.lines.length||c.invalid||c.totalMinor%100!==0||c.totalMinor<100||!Number.isSafeInteger(c.totalMinor))
        return reply('I need to confirm the items and price before checkout. No payment has been requested. Would you like staff assistance?');
      const latest=cmd==='PICKUP'?await productionCustomerOrder(waId):null;
      if(latest&&['starting','prompt_sent','review_required'].includes(String(latest.status)))return reply('Your payment is still being checked. Please do not pay again.');
      // The payment backend validates the complete cart identity before reusing a
      // quote. Do not infer that a matching total means the same items.
      const ref='DBKWA'+randomUUID().replace(/-/g,'').slice(0,7).toUpperCase();
      const order=await createProductionCheckout({reference:ref,waId,amountKes:c.totalMinor/100,
        cart:c.lines.map(l=>({productId:l.item.id,variantId:l.variantId,quantity:l.quantity,subtotalMinor:l.subtotalMinor})),
        fulfillment:'pickup'});
      if(order.status!=='quoted'){await flagReview('Payment initiation');return reply(`Payment for ${order.reference} is awaiting confirmation. Please do not pay again. Reply PAYMENT STATUS for the latest recorded status. I’ve flagged this for our team.`);}
      if(cmd!=='PICKUP')return reply(`Your order total is ${money(Number(order.amountKes))} (${order.reference}). Would you like to collect from our store? If you prefer delivery, tell me your town or area and county (e.g. Kikuyu, Kiambu). Our team can confirm the cost first.\n\n${cartSummary(c)}`);
    }
    if(cmd==='PICKUP'){
      const o=await confirmProductionPickup(waId);
      if(!o)return reply('I need to prepare your order first. Would you like to check out?');
      await clearDelivery();
      return reply(paymentQuestion(o as {reference:unknown;amount_kes:unknown}));
    }
    if(cmd==='PAY'){
      if(!expectedPayment){
        const current=await productionCustomerOrder(waId);
        if(current?.status==='quoted'&&current.pickup_confirmed_at)return reply(paymentQuestion(current as {reference:unknown;amount_kes:unknown;payer_phone?:unknown}));
        return reply('Please confirm your order and payment number first.');
      }
      const o=await payProductionCheckout(waId,expectedPayment);
      return reply(`I've requested an M-PESA prompt for ${money(o.amountKes)}. Please check your phone and enter your PIN only in the official M-PESA prompt. I'll only confirm payment once Safaricom verifies it.`);
    }

  }catch(e){
    const code=cleanError(e);
    if(code.includes('ACTIVE_QUOTE_MISMATCH')){await cancelProductionQuote(waId);return reply('Your cart or promotion price has changed since the earlier quote. Please review your cart and place the order again. No new payment has been requested.');}
    if(code==='DARAJA_AUTH_NOT_READY_NO_STK'){await flagReview('Payment initiation');return reply('M-PESA is temporarily unavailable. No payment prompt was sent for this attempt. Your order is saved; you can ask me to send the prompt again when ready.');}
    if(code.includes('OUTCOME_UNCERTAIN')||code.includes('ALREADY_IN_PROGRESS')){await flagReview('Payment initiation');return reply('I couldn’t confirm whether M-PESA received the request. I’ve flagged this for our team. Please do not pay again until we verify it. You can still ask me about other products.');}
    console.warn('DBK155_CHECKOUT_REVIEW',code);
    return reply('I couldn’t complete that step safely. Please do not send another payment request until our team checks it.');
  }
  if(/\b(?:m[ -]?pesa|stk|payment prompt|pay now|place (?:my |the )?order)\b/i.test(text)&&/\b(?:send|prompt|push|place|request|pay now)\b/i.test(text))return reply('I can help you complete your order. Please confirm your cart and collection first, then request the M-PESA prompt for your confirmed total. No payment has been requested.');
  if(pointerOnly(text)){
    const options=(await shortlist()).filter((p):p is SaleItem=>!!p&&p.stockQuantity!==0);
    if(options.length&&fresh)return reply(options.length===1?`Do you mean ${safe(options[0].name)}?`:`Which of these did you mean: ${options.map(p=>safe(p.name)).join(', ')}?`);
    if(previousMiss(await previousReply()))return show([]);
    return reply('Which item do you mean? I can’t identify it from that message alone. Please send its name, or I can connect you with our sales team.');
  }
  if(/\b(?:place|make|confirm)\s+(?:an? |my |the |this )?order\b/i.test(text))return reply('Please tell me the exact product and quantity you want to order. I’ll confirm the selected options and cart total before payment.');
  if(/\b(?:cart|basket)\b/i.test(text)&&/\b(?:remove|delete|cancel|clear|empty|display|view|show|keep|leave)\b/i.test(text))return reply('To change your cart, reply CLEAR CART, CART, or REMOVE ITEM followed by its number.');
  const local=contextualRequest(text);
  if(local||process.env.DBK100_WA_AI_ENABLED==='YES'){
    const stored=await shortlist();
    // Do not renumber a stale shortlist. A missing entry invalidates the old selection.
    const options=stored.every(p=>p&&p.stockQuantity!==0)?stored as SaleItem[]:[];
    // The model receives a short history of customer utterances and verified shortlist names, never credentials or payment records.
    const recent=local?[]:await db`SELECT message_text FROM public.dbk36_wa_messages WHERE wa_id=${waId} AND direction='in' AND status='done' AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 4`;
    const plan=local||await planShopping(text,options,recent.map(r=>String(r.message_text||'')).reverse(),await previousReply());
    if(plan?.intent==='search'){
      if(!fresh)return reply('I’m refreshing our catalogue. Could you try again shortly?');
      if(!plan.query)return reply('What kind of item are you looking for?');
      const candidate=groupedMatches(plan.query,products);
      return showSearch(candidate.items.length?plan.query:directQuery||plan.query);
    }
    if(plan&&['photo','price','details'].includes(plan.intent)){
      if(!fresh)return reply('I need to refresh the catalogue before confirming that. Please try again shortly.');
      const chosen=resolveShoppingProduct(options,{...plan,query:cleanProductQuery(plan.query)})||(!plan.option&&plan.query?resolveShoppingProduct(products,{...plan,query:cleanProductQuery(plan.query)}):undefined);
      if(!chosen){
        if(plan.query&&!plan.option)return showSearch(plan.query);
        if(plan.intent==='photo'&&!plan.query&&!plan.option&&options.length>1)return show(options);
        return reply(options.length?`Which one did you mean — ${options.map(p=>safe(p.name)).join(', ')}?`:'Which product would you like to know more about?');
      }
      // Narrow the shortlist to the explicitly resolved product so the next "it"/"one" refers to the same item.
      if(plan.intent==='photo'||plan.intent==='details')return show([chosen]);
      await show([chosen]);
      return {reply:`${safe(chosen.name)} is listed at ${money(chosen.price)}${chosen.variants?' (options available)':''}. Would you like help choosing one?`,images:undefined};
    }
    if(fresh&&!/\b(?:pay|payment|mpesa|stk|cart|checkout|order|cancel|deliver|delivery|refund|remove|add|not|don't|dont|no|except)\b/i.test(text)&&(!plan||plan.intent==='clarify')){const matched=groupedMatches(text,products);if(matched.items.length)return showSearch(text);}
    if(directQuery&&fresh&&(!plan||plan.intent==='clarify'||plan.intent==='information')){const matched=relevantProducts(directQuery,products);if(matched.length)return show(matched);}
    if(plan?.intent==='clarify'||plan?.intent==='information'){
      // Informational answers are model-generated from approved knowledge, not authoritative transaction results.
      if(plan.message&&!/\b(?:send|request|initiate|trigger)\b.{0,60}\b(?:prompt|stk|push)\b|\b(?:provide|enter|share|confirm|type)\b.{0,60}\b(?:phone|mobile|m[ -]?pesa|payment|whatsapp) number\b|\b(?:cannot|can.t|unable to)\b.{0,45}\b(?:prompt|stk|push)\b/i.test(plan.message)&&!/https?:|\b(?:pin|otp|password|paid|charged|refunded|reserved|added to|payment confirmed)\b|\b(?:KES|KSH)\s*\d/i.test(plan.message))return reply(plan.message);
    }
    // No arbitrary keyword search after a failed/ambiguous plan. Explicit search phrases may use a safe deterministic fallback.
    if(!plan&&fresh&&/^(?:do you have|i(?:'m| am) looking for|show me|find|search for|nataka|mnazo)\b/i.test(text))return show(relevantProducts(text,products));
    return reply(options.length===1?`Are you asking about ${safe(options[0].name)}? Tell me how many you want, or ask about a different product.`:'What would you like to find? I can also help you speak to our team.');
  }
  return reply("What product are you looking for, or would you like to speak to our team?");
}
