export type SalesProduct={id:string;name:string;slug:string;price:number;stockQuantity:number|null;variants:boolean;imageUrl?:string};
const stop=new Set('hi hello hey kasiwa do you have any is are there some available please could would can i me my want need looking for to buy get show find see photos photo pictures picture images image of the a an in on with what your sell stock bei gani mna mnazo nataka tafuta na ya za'.split(' '));
const normalize=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const stem=(s:string)=>s.length>4&&s.endsWith('s')?s.slice(0,-1):s;
export function relevantProducts(query:string,products:SalesProduct[]){
  const terms=normalize(query).split(' ').filter(w=>w.length>2&&!stop.has(w)).map(stem);
  if(!terms.length)return [];
  return products.filter(p=>p.stockQuantity===null||p.stockQuantity>0).map(p=>{
    const name=normalize(p.name).split(' ').map(stem);const slug=normalize(p.slug).split(' ').map(stem);
    // Product nouns must match; generic decorative descriptors alone cannot select unrelated items.
    const specific=terms.filter(w=>!['decorative','decor','beautiful','nice','modern','home','large','small','round'].includes(w));
    const required=specific.length?specific:terms;
    const score=required.reduce((n,w)=>n+(name.includes(w)?4:slug.includes(w)?2:0),0);
    const match=required.some(w=>name.includes(w)||slug.includes(w));
    return {p,score:match?score:0};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.name.localeCompare(b.p.name)).slice(0,3).map(x=>x.p);
}
export function catalogueImage(value:unknown):string|undefined{
  if(typeof value!=='string'||value.length>1500)return;
  try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='cdn.sanity.io'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/images/'))return u.toString();}catch{}
}
export function naturalCommand(text:string):string{
  const t=text.trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ').toUpperCase();
  if(/^(HI|HELLO|HEY|HABARI|MAMBO|SASA)( KASIWA)?$/.test(t))return 'HI';
  if(/^(SHOW (ME )?(MY )?(CART|BASKET)|WHAT IS IN MY CART|WHAT IS MY TOTAL|MY TOTAL|NIONYESHE CART)$/.test(t))return 'CART';
  if(/^(I WANT TO (CHECK OUT|CHECKOUT|PLACE MY ORDER)|LET.S CHECK OUT|I.M READY TO (BUY|CHECK OUT)|PROCEED TO CHECKOUT|NATAKA KUAGIZA|PLACE MY ORDER|I WANT TO PLACE THE ORDER|LET.S ORDER|I WANT TO BUY IT)$/.test(t))return 'CHECKOUT';
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
  if(/^(I WANT (IT|ONE|THIS ONE)|I'LL TAKE (IT|ONE)|YES,? I WANT ONE|NATAKA MOJA|ADD IT|ADD THIS)$/.test(t))return 'ADD';
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
