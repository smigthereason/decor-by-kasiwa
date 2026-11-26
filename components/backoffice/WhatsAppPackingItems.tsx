"use client";
import {useState} from 'react';
import type {PackingLine} from '@/lib/whatsapp/dbk162-packing';
export function CataloguePhoto({url,alt,small=false}:{url?:string|null;alt:string;small?:boolean}){
  const [failed,setFailed]=useState<string|null>(null);
  let safe=false;try{const u=new URL(url||'');safe=u.protocol==='https:'&&u.hostname==='cdn.sanity.io'&&!u.username&&!u.password&&!u.port&&u.pathname.startsWith('/images/');}catch{}
  const size=small?'h-12 w-12':'h-24 w-24';
  return safe&&url&&failed!==url?<img src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(url)} className={`${size} shrink-0 rounded-lg border border-neutral-200 bg-white object-contain`}/>:<div className={`${size} grid shrink-0 place-items-center rounded-lg bg-neutral-100 p-1 text-center text-[10px] text-neutral-500`}>No photo</div>;
}
export default function WhatsAppPackingItems({items,compact=false}:{items?:PackingLine[];compact?:boolean}){
  if(!items?.length)return <p className="text-xs text-amber-800">Items unavailable — verify before packing.</p>;
  return <div className="space-y-2">{items.map((item,i)=><div key={`${item.productId}:${item.variantId}:${i}`} className="flex items-center gap-3"><CataloguePhoto url={item.imageUrl} alt={item.name} small={compact}/><div className="min-w-0 text-xs"><p className="font-semibold break-words">{item.name} × {item.quantity}</p>{item.variantLabel&&<p>{item.variantLabel}</p>}{item.sku&&<p className="text-neutral-500">SKU: {item.sku}</p>}{item.variantId&&item.imageKind==='product'&&<p className="text-neutral-500">Parent product photo</p>}{!item.identified&&<p className="text-amber-800">Verify catalogue identity</p>}<p>KES {(item.subtotalMinor/100).toLocaleString('en-KE')}</p></div></div>)}</div>;
}
