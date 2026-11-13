import 'server-only';
/** DBK-100 natural-language assistant for the *existing* production bot.
 * LLM can only write a brief introduction. The products, prices and links
 * are deterministic from the current Neon catalogue cache. Never call tools
 * that can charge customers or change stock from this module.
 */
type Product={id:string;name:string;slug:string;price:number;stockQuantity:number|null;variants:boolean};
const stop=new Set(['this','that','from','some','could','would','please','need','want','with','what','have','there','show','me','and','for','the','you','are','can','decor','home','looking','like','buy','items','room','under','budget','recommend','your','stock','image','images','photo','photos']);
function choose(query:string,products:Product[]):Product[]{
  const words=query.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2&&!stop.has(w)).slice(0,12);
  const scored=products.filter(p=>p.stockQuantity===null||p.stockQuantity>0).map((p,i)=>({p,i,
    score:words.reduce((n,w)=>n+(p.name.toLowerCase().includes(w)?3:0),0)}));
  scored.sort((a,b)=>b.score-a.score||a.i-b.i);
  return scored.slice(0,3).map(x=>x.p);
}
async function shortIntroduction(query:string):Promise<string>{
  if(!process.env.OPENAI_API_KEY)return 'Here are a few options from the current catalogue:';
  try{
    const result=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',cache:'no-store',signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:'gpt-4.1-mini',store:false,max_output_tokens:65,
        instructions:'Write exactly one brief, friendly Kenyan-English sentence introducing a store product shortlist. Do not name specific products or give prices, stock, discounts, checkout instructions, payment promises, links or contact details. No markdown.',
        input:query.slice(0,350)})
    });
    if(!result.ok)return 'Here are a few options from the current catalogue:';
    const data=await result.json() as {output?:Array<{content?:Array<{type?:string;text?:string}>}>};
    const raw=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join(' ').trim();
    // Only a safe short intro; all commerce facts come from Neon data below.
    if(!raw||raw.length>160||/\b(?:KES|KSH|M-?PESA|STK|https?:|[0-9]{3,})\b/i.test(raw))
      return 'Here are a few options from the current catalogue:';
    return raw.replace(/[\r\n*`]/g,' ');
  }catch{return 'Here are a few options from the current catalogue:';}
}
export async function buildNaturalRecommendation(query:string,products:Product[]):Promise<{message:string;firstProductId:string|null}>{
  const picked=choose(query,products);
  if(!picked.length)return {message:'Our catalogue is refreshing. Reply STAFF for assistance.',firstProductId:null};
  const intro=await shortIntroduction(query);
  const list=picked.map((p,i)=>`${i+1}. ${p.name.replace(/[\r\n*`]/g,' ').slice(0,90)} — KES ${p.price.toLocaleString('en-KE')}\nhttps://decorbykasiwa.co.ke/shop/${encodeURIComponent(p.slug)}`).join('\n\n');
  const purchasable=(!picked[0].variants&&picked[0].stockQuantity!==0)?picked[0]:null;
  const note=purchasable?'Reply ADD to add the first available non-variant product to your cart. Then CART > CHECKOUT > PICKUP > PAY.':'For size/colour options, reply STAFF.';
  return {message:`${intro}\n\n${list}\n\n${note}\nPrices and availability are verified again before payment.`,
    firstProductId:purchasable?.id||null};
}
