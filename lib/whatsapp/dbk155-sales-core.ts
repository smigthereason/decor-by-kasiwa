export type SalesProduct={id:string;name:string;slug:string;price:number;stockQuantity:number|null;variants:boolean;imageUrl?:string};
const stop=new Set('hi hello hey kasiwa do you have any is are there some available please could would can i me my want need looking for to buy get show find see photos photo pictures picture images image of the a an in on with what your sell stock bei gani mna mnazo nataka tafuta na ya za bedroom living room bathroom house home decorative decor beautiful nice modern like'.split(' '));
const normalize=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const stem=(s:string)=>s.length>4&&s.endsWith('s')?s.slice(0,-1):s;
const words=(s:string)=>normalize(s).split(' ').filter(Boolean).map(stem);
export function relevantProducts(query:string,products:SalesProduct[]){
  const terms=[...new Set(normalize(query).split(' ').filter(w=>w.length>2&&!stop.has(w)).map(stem))];
  if(!terms.length)return [];
  const queryIsMirror=terms.includes('mirror')&&!terms.some(w=>['clock','sticker','letter','acrylic','decal'].includes(w));
  return products.filter(p=>p.stockQuantity===null||p.stockQuantity>0).map(p=>{
    const name=words(p.name),slug=words(p.slug);
    if(queryIsMirror&&name.some(w=>['clock','sticker','letter','decal'].includes(w)))return {p,score:0};
    // Names are authoritative: a legacy/mismatched slug cannot make an unrelated product a match.
    if(!terms.every(w=>name.includes(w)))return {p,score:0};
    const exact=name.join(' ')===terms.join(' ');
    return {p,score:(exact?100:0)+terms.length*4+terms.filter(w=>slug.includes(w)).length-(name.length-terms.length)*0.1};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.name.localeCompare(b.p.name)).slice(0,3).map(x=>x.p);
}
export function catalogueImage(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>1500)return;
  try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='cdn.sanity.io'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/images/'))return u.toString();}catch{}
}
export function productImage(raw:Record<string,unknown>,project='',dataset=''):string|undefined{
  const validProject=/^[a-z0-9]+$/i.test(project)&&/^[a-z0-9_-]+$/i.test(dataset);
  function read(v:unknown,depth:number):string|undefined{
    if(depth>3)return;
    const direct=catalogueImage(v);if(direct)return direct;
    if(typeof v==='string'&&validProject){const m=/^image-([a-f0-9]{16,64})-(\d+x\d+)-(jpg|jpeg|png|webp)$/i.exec(v);if(m)return catalogueImage(`https://cdn.sanity.io/images/${project}/${dataset}/${m[1]}-${m[2]}.${m[3]}`);}
    if(Array.isArray(v)){for(const item of v.slice(0,8)){const found=read(item,depth+1);if(found)return found;}return;}
    if(v&&typeof v==='object'){const obj=v as Record<string,unknown>;for(const k of ['url','imageUrl','asset','_ref','image','src']){const found=read(obj[k],depth+1);if(found)return found;}}
  }
  for(const k of ['imageUrl','images','image','heroImage','mainImage','thumbnailUrl','thumbnail','imageUrls','featuredImage','image_url']){const found=read(raw[k],0);if(found)return found;}
}
export type ShoppingIntent='search'|'photo'|'price'|'details'|'clarify'|'information';
export type ShoppingPlan={intent:ShoppingIntent;query:string;option:number;message:string};
export function parseShoppingPlan(raw:string):ShoppingPlan|null{
  try{const x=JSON.parse(raw);if(!x||!['search','photo','price','details','clarify','information'].includes(x.intent)||typeof x.query!=='string'||x.query.length>120||!Number.isInteger(x.option)||x.option<0||x.option>3||typeof x.message!=='string'||x.message.length>400)return null;
    return {intent:x.intent,query:x.query.trim(),option:x.option,message:x.message.trim()};}catch{return null;}
}
export function resolveShoppingProduct(options:SalesProduct[],plan:ShoppingPlan):SalesProduct|undefined{
  if(plan.query){const exact=options.filter(p=>p.stockQuantity!==0&&words(p.name).join(' ')===words(plan.query).join(' '));if(exact.length===1)return exact[0];const matched=relevantProducts(plan.query,options);return matched.length===1?matched[0]:undefined;}
  if(plan.option>0)return options[plan.option-1];
  return options.length===1?options[0]:undefined;
}
export function contextualRequest(text:string):ShoppingPlan|null{
  const t=normalize(text);const plan=(intent:ShoppingIntent,query=''):ShoppingPlan=>({intent,query,option:0,message:''});
  if(/^(?:can i see|could i see|show(?: me)?|send me|may i see|i want to see) (?:a |the |some )?(?:picture|pictures|photo|photos|image|images)(?: of (?:the )?(.+))?$/.test(t)){const match=t.match(/ of (?:the )?(.+)$/);return plan('photo',match?.[1]||'');}
  if(/^(?:how much(?: is| does)? (?:it|that|this|that one|this one)(?: cost)?|what is the price|price|bei gani|bei yake)$/.test(t))return plan('price');
  if(/^(?:can i see it|can i see them|show me the photo|show me the picture)$/.test(t))return plan('photo');
  return null;
}
export function naturalCommand(text:string):string{
  const t=text.trim().replace(/[’‘]/g,"'").replace(/[.!?]+$/,'').replace(/\s+/g,' ').toUpperCase();
  if(/^(HI|HELLO|HEY|HABARI|MAMBO|SASA)( KASIWA)?$/.test(t))return 'HI';
  if(/^(SHOW (ME )?(MY )?(CART|BASKET)|WHAT IS IN MY CART|WHAT IS MY TOTAL|MY TOTAL|NIONYESHE CART)$/.test(t))return 'CART';
  if(/^(I WANT TO (CHECK OUT|CHECKOUT|PLACE MY ORDER)|LET.S CHECK OUT|I.M READY TO (BUY|CHECK OUT)|PROCEED TO CHECKOUT|NATAKA KUAGIZA|PLACE MY ORDER|I WANT TO PLACE THE ORDER|LET.S ORDER)$/.test(t))return 'CHECKOUT';
  if(/^(I( WILL|'LL) (COLLECT( IT)?|PICK (IT )?UP)|I PREFER (PICKUP|COLLECTION)|COLLECTION|NITACHUKUA|CONFIRM PICKUP|PICKUP PLEASE|I WILL COLLECT IT|I WANT TO COLLECT)$/.test(t))return 'PICKUP';
  if(/^(YES[, ]+PLEASE SEND (ME )?(THE |AN? )?(M-?PESA|STK)( PAYMENT)? (PROMPT|REQUEST)|SEND (ME )?(THE |AN? )?(M-?PESA|STK)( PAYMENT)? (PROMPT|REQUEST|PUSH)|I CONFIRM (THE )?PAYMENT|PAY NOW|TUMA (M-?PESA|STK)( PROMPT)?)$/.test(t))return 'PAY';
  if(/^(DELIVERY|I( WOULD|'D) LIKE DELIVERY|PLEASE DELIVER|NATAKA DELIVERY)$/.test(t))return 'DELIVERY QUOTE';
  if(/^(TALK TO (A )?(HUMAN|STAFF|PERSON)|CONNECT ME TO STAFF|HUMAN HELP|NATAKA KUONGEA NA MTU)$/.test(t))return 'STAFF';
  if(/^(DID MY PAYMENT GO THROUGH|HAVE I PAID|CHECK MY PAYMENT|PAYMENT STATUS|HAS MY PAYMENT GONE THROUGH)$/.test(t))return 'PAYMENT STATUS';
  if(/^(CANCEL (MY )?(ORDER|CHECKOUT)|CANCEL MY QUOTE)$/.test(t))return 'CANCEL CHECKOUT';
  if(/^(CLEAR (MY )?CART|EMPTY (MY )?CART)$/.test(t))return 'CLEAR CART';
  if(/^\d{1,2}$/.test(t))return 'SELECT '+t;
  const selected=/^(?:I (?:WANT|LIKE|CHOOSE|WILL TAKE)|I'LL TAKE|NATAKA|SELECT|CHOOSE|ADD) (?:OPTION |NUMBER |ITEM )?(\d{1,2})(?: PLEASE)?$/.exec(t);
  if(selected&&!/^ADD \d+$/.test(t))return 'SELECT '+selected[1];
  if(/^(I WANT (IT|ONE|THIS ONE)|I WANT TO BUY (IT|ONE|THIS ONE)|I'LL TAKE (IT|ONE)|I'D LIKE TO BUY (ONE|IT|THIS ONE)|I WOULD LIKE TO BUY (ONE|IT|THIS ONE)|I'D LIKE (ONE|IT)|I WOULD LIKE (ONE|IT)|YES,? I WANT ONE|NATAKA MOJA|ADD IT|ADD THIS)$/.test(t))return 'ADD';
  if(/^(I WANT TWO|I'LL TAKE TWO|NATAKA MBILI)$/.test(t))return 'ADD 2';
  return t;
}
export const knowledgeSections=['tone','business','delivery','returns','payments','products','examples','handover'] as const;
export type KnowledgeSection=typeof knowledgeSections[number];
export function validKnowledge(value:unknown):value is Record<KnowledgeSection,string>{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const v=value as Record<string,unknown>;
  return Object.keys(v).length===knowledgeSections.length&&knowledgeSections.every(k=>typeof v[k]==='string'&&(v[k] as string).length<=3000);
}
export const defaultKnowledge:Record<KnowledgeSection,string>={tone:'Friendly, concise Kenyan English. Match Kiswahili or mixed language when appropriate. Introduce yourself as Kasiwa when greeting; no command menus.',business:'Decor By Kasiwa sells home decor. Store addresses, hours and contacts require owner confirmation.',delivery:'Delivery requires a staff quote. Collection availability and location must be confirmed; do not invent fees or timings.',returns:'Refer returns, refunds and exchanges to staff until policy is approved.',payments:'M-PESA requires explicit customer approval and verified provider settlement. Never request PIN or OTP in chat.',products:'Use actual catalogue names, images, prices and stock. Never invent items or discounts.',examples:'Customer: Do you have mirrors? Kasiwa: Yes, here are the matching options. Which one would you like?',handover:'When facts are missing, offer to flag the conversation for the team. Do not promise a response time.'};
