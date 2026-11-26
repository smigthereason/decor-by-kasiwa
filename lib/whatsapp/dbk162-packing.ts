/** Read-only packing projection: quantities and amounts come only from the paid snapshot. */
export type PackingProduct={id:string;name?:string;sku?:string;imageUrl?:string;variants?:Array<{id:string;title?:string;colour?:string;size?:string;sku?:string;imageUrl?:string}>};
export type PackingLine={productId:string;variantId:string;name:string;variantLabel:string;sku:string;quantity:number;subtotalMinor:number;imageUrl?:string;imageKind:'variant'|'product'|'none';identified:boolean};
function image(value:unknown):string|undefined{
  if(typeof value!=='string')return;
  try{const u=new URL(value);if(u.protocol==='https:'&&u.hostname==='cdn.sanity.io'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/images/'))return u.toString();}catch{/* missing or invalid image */}
}
export function packingLines(snapshot:unknown,products:PackingProduct[]):PackingLine[]{
  if(!Array.isArray(snapshot))return [];
  const byId=new Map(products.map(p=>[p.id,p]));
  return snapshot.flatMap(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return [];
    const {productId,variantId='',quantity,subtotalMinor}=raw;
    if(typeof productId!=='string'||!productId||typeof variantId!=='string'||!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(subtotalMinor)||subtotalMinor<1)return [];
    const p=byId.get(productId),v=variantId?p?.variants?.find(x=>x.id===variantId):undefined;
    const variantImage=image(v?.imageUrl),parentImage=image(p?.imageUrl),imageUrl=variantImage||parentImage;
    return [{productId,variantId,name:p?.name||productId,variantLabel:variantId?(v?[v.title,v.colour,v.size].filter(Boolean).join(' / ')||variantId:variantId):'',sku:variantId?v?.sku||'':p?.sku||'',quantity,subtotalMinor,imageUrl,imageKind:variantImage?'variant':parentImage?'product':'none',identified:Boolean(p?.name&&(!variantId||v))} satisfies PackingLine];
  });
}
