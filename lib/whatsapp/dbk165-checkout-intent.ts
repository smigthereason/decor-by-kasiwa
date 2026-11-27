/** Deterministic customer intent; never infer payment consent from a model. */
const norm=(text:string)=>text.toLowerCase().replace(/[’‘]/g,"'").replace(/\bm[\s-]?pesa\b/g,'mpesa').replace(/[.,!?]+/g,' ').replace(/\s+/g,' ').trim();
export const paymentAssent=(text:string)=>/^(?:yes(?: please| go ahead| send it| sure)?|yeah|yep|sure|go ahead|ndio|ndiyo|sawa)$/.test(norm(text));
export function checkoutIntent(text:string,waId:string):'CHECKOUT'|'PICKUP'|'PAY'|'PAY_OTHER_PHONE'|'PAY_PHONE'|null{
  const t=norm(text).replace(/^(?:hi|hello|hey)(?: kasiwa)? (?=i |please |send |pay )/,'');
  const numbers=t.match(/(?:\+?254|0)[17](?:[ -]?\d){8}\b/g)||[];
  const normalized=numbers.map(n=>n.replace(/\D/g,'').replace(/^0/,'254'));
  const stripped=t.replace(/(?:\+?254|0)[17](?:[ -]?\d){8}\b/g,'').replace(/\s+/g,' ').trim();
  if(numbers.length&&/^(?:\+?254|0)[17](?:[ -]?\d){8}$/.test(t))return normalized.every(n=>n===waId)?'PAY_PHONE':'PAY_OTHER_PHONE';
  if(/^(?:please )?(?:place|confirm|complete|submit|finali[sz]e) (?:my |the |this )?order(?: please| now)?$/.test(t)||/^(?:i (?:want|would like|need) to|i'd like to|let's) (?:place (?:my |the |this )?order|checkout|check out)(?: please| now)?$/.test(t)||/^(?:checkout|check out|proceed to payment)(?: please| now)$/.test(t))return 'CHECKOUT';
  if(/^(?:(?:i (?:will|want to|would like to)|will|i'll|i'd like to) )?(?:collect|pick up|pickup|collection)(?: it| from (?:the |your )?store)?(?: please)?$/.test(t))return 'PICKUP';
  // Questions, negation and arbitrary text must never count as an instruction to charge.
  if(/[?]/.test(text)||/\b(?:not|don't|dont|never|cancel|stop|if|how|why|can you|could you|what)\b/.test(t))return null;
  const request=/^(?:(?:yes|okay|ok|please) )*(?:send(?: me)? (?:the |an? )?|request (?:the |an? )?|tuma )?(?:mpesa(?: payment)? (?:prompt(?:\s*\/\s*stk push)?|push|request)|stk (?:push|prompt|request))(?: (?:now|please))*(?: (?:to|on) my (?:whatsapp |phone |mpesa )?number)?(?: (?:now|please))*$/.test(stripped)||/^(?:i (?:want|would like) to pay|i'd like to pay|pay now|pay via mpesa|pay with mpesa)(?: for (?:my|the|this) order)?(?: please)?$/.test(stripped);
  if(request)return normalized.some(n=>n!==waId)?'PAY_OTHER_PHONE':'PAY';
  return null;
}
// Generic shopping intent is never permission to send an STK request.
export function wantsCheckout(text:string):boolean{
  if(text.includes('?'))return false;
  const t=norm(text).replace(/^(?:hi|hello|hey)(?: kasiwa)? /,'').replace(/^please /,'').replace(/ (?:please|now)$/,'');
  return /^(?:checkout|check out|buy|lipa(?: (?:hii|hizi))?|lipia(?: (?:hii|hizi))?|nataka (?:kulipa|kulipia)(?: (?:hii|hizi|order|bidhaa|order yangu))?|(?:i (?:want|need|would like) to|i'd like to|let me) pay(?: for (?:it|this|that|these|them|this item|these items|my order|the order|this order|my cart))?|pay(?: for (?:it|this|that|these|them|my order|the order|my cart))?)$/.test(t);
}
export function wantsSelectedPurchase(text:string):boolean{
  return !text.includes('?')&&/^(?:(?:i (?:want|need|would like) to|i'd like to|let me) (?:buy|get|purchase|take)(?: (?:it|this|that|this one|that one|these|them))?|nataka (?:kununua|kuchukua)(?: (?:hii|hizi|hiyo))?|nataka hii|nataka hizi)$/.test(norm(text).replace(/ (?:please|now)$/,''));
}
export const DELIVERY_QUESTION='Where should we deliver? Please tell me your town or area and county, e.g. Kikuyu, Kiambu.';
export const counties='Baringo|Bomet|Bungoma|Busia|Elgeyo Marakwet|Embu|Garissa|Homa Bay|Isiolo|Kajiado|Kakamega|Kericho|Kiambu|Kilifi|Kirinyaga|Kisii|Kisumu|Kitui|Kwale|Laikipia|Lamu|Machakos|Makueni|Mandera|Marsabit|Meru|Migori|Mombasa|Muranga|Nairobi|Nakuru|Nandi|Narok|Nyamira|Nyandarua|Nyeri|Samburu|Siaya|Taita Taveta|Tana River|Tharaka Nithi|Trans Nzoia|Turkana|Uasin Gishu|Vihiga|Wajir|West Pokot'.split('|');
const key=(v:string)=>norm(v).replace(/[-']/g,' ').replace(/\s+/g,' ').trim();
const townMap:Record<string,string>={chuka:'Tharaka Nithi',chogoria:'Tharaka Nithi',thika:'Kiambu',ruiru:'Kiambu',kikuyu:'Kiambu',juja:'Kiambu',limuru:'Kiambu',kitengela:'Kajiado',ngong:'Kajiado','ongata rongai':'Kajiado',eldoret:'Uasin Gishu',kitale:'Trans Nzoia',naivasha:'Nakuru',nanyuki:'Laikipia',malindi:'Kilifi',watamu:'Kilifi',voi:'Taita Taveta',diani:'Kwale',mwatate:'Taita Taveta',kerugoya:'Kirinyaga',karatina:'Nyeri',wote:'Makueni',ithanga:'Muranga',migori:'Migori',bondo:'Siaya',maua:'Meru',mwingi:'Kitui'};
export function knownCounty(location:string):string|undefined{
  const parts=location.split(',').map(x=>x.trim());
  if(parts.length===2){const explicit=counties.find(c=>key(c)===key(parts[1]).replace(/ county$/,''));if(!explicit)return undefined;const inferred=knownCounty(parts[0]);return inferred&&inferred!==explicit?undefined:explicit;}
  const k=key(location).replace(/ county$/,'').replace(/^county of /,'');
  return counties.find(c=>key(c)===k)||Object.prototype.hasOwnProperty.call(townMap,k)&&townMap[k]||undefined;
}
export function deliveryLocation(text:string,awaiting:boolean):string|null{
  const t=text.trim().replace(/\bdelivary\b/gi,'delivery').replace(/[.!?]+$/,'').replace(/,?\s+please$/i,'').trim();
  const m=/^(?:(?:do|can|could|will) you |how much is |what is the cost of |please |i (?:want|would like|need) |i'd like )?(?:deliver(?:y)?|ship(?:ping)?)(?: (?:it|my order))? (?:to|in|at) (.+)$/i.exec(t);
  const referenced=/^(?:i (?:want|need|would like)|nataka) (?:these|those|this|them|hizi|hizo)(?: kindly| please)? (?:delivered|delivery) (?:to|in|at) (.+)$/i.exec(t);
  const located=m?.[1]||referenced?.[1]|| (awaiting?t.replace(/^(?:i(?:'m| am) (?:in|at)|to|in|at|my location is)\s+/i,''):'');
  if(!located||located.length>70||!/^[\p{L}][\p{L}\s.'’,-]*$/u.test(located)||/\b(?:pay|payment|mpesa|cart|order|yes|no|cancel|staff|hello|thanks|pickup|collect|please|delivery|want|buy|price)\b/i.test(located))return null;
  return located.trim();
}
