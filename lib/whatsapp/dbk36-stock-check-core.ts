/** Pure live quote/stock comparison; does not reserve or deduct stock. */
type Line={productId:string;quantity:number;subtotal:number;variantId?:string};
type Item={id:string;price:number;available?:boolean;ecommerceEnabled?:boolean;stockQuantity?:number|null;
  variants?:Array<{id:string;price?:number;stockQuantity?:number|null}>};
export function validateQuoteRequest(value:unknown):{reference:string;amountKes:number;lines:Line[]}|null {
  if(!value || typeof value!=='object'||Array.isArray(value))return null;
  const x=value as Record<string,unknown>;
  if(typeof x.reference!=='string'||!/^DBKWA[A-Z0-9]{7}$/.test(x.reference)||
    typeof x.amountKes!=='number'||!Number.isSafeInteger(x.amountKes)||x.amountKes<1||x.amountKes>500||
    !Array.isArray(x.lines)||x.lines.length===0||x.lines.length>12)return null;
  const seen=new Set<string>();let sum=0; const lines:Line[]=[];
  for(const raw of x.lines){
    if(!raw || typeof raw!=='object'||Array.isArray(raw))return null;
    const line=raw as Record<string,unknown>;
    if(typeof line.productId!=='string'||line.productId.length<1||line.productId.length>180||
       !Number.isSafeInteger(line.quantity)||(line.quantity as number)<1||(line.quantity as number)>20||
       !Number.isSafeInteger(line.subtotal)||(line.subtotal as number)<1||
       (line.subtotal as number)%(line.quantity as number)!==0||
       (line.variantId!==undefined && (typeof line.variantId!=='string'||line.variantId.length>180))||
       seen.has(line.productId)) return null;
    seen.add(line.productId);sum+=line.subtotal as number;
    lines.push({productId:line.productId,quantity:line.quantity as number,subtotal:line.subtotal as number,
      variantId:typeof line.variantId==='string'?line.variantId:''});
  }
  return sum===x.amountKes?{reference:x.reference,amountKes:x.amountKes,lines}:null;
}
/** Deny unknown stock, ambiguous variants, price changes, or unavailable items. */
export function compareAuthoritativeQuote(
  quote:{reference:string;amountKes:number;lines:Line[]},
  saleCatalogue:Item[], locationStock:Item[]
):boolean {
  if(!Array.isArray(saleCatalogue)||!Array.isArray(locationStock))return false;
  const bySale=new Map(saleCatalogue.map(p=>[p.id,p]));
  const byStock=new Map(locationStock.map(p=>[p.id,p]));
  return quote.lines.every(line=>{
    const product=bySale.get(line.productId);const stock=byStock.get(line.productId);
    if(!product||!stock||product.available===false||product.ecommerceEnabled===false)return false;
    const variants=Array.isArray(product.variants)?product.variants:[];
    if(variants.length>0 && !line.variantId)return false;
    const variant=line.variantId?variants.find(v=>v.id===line.variantId):null;
    if(line.variantId&&!variant)return false;
    const stockVariant=line.variantId?stock.variants?.find(v=>v.id===line.variantId):null;
    if(line.variantId&&!stockVariant)return false;
    const salePrice=variant?.price??product.price;
    const qty=stockVariant?.stockQuantity??(line.variantId?null:stock.stockQuantity);
    if(!Number.isFinite(salePrice)||!Number.isInteger(salePrice)||salePrice<=0 ||
       typeof qty!=='number'||!Number.isSafeInteger(qty)||qty<line.quantity)return false;
    return salePrice*line.quantity===line.subtotal;
  });
}
