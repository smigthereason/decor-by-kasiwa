import 'server-only';
import {serverClient} from '@/sanity/lib/serverClient';
import {packingLines, type PackingProduct} from './dbk162-packing';
/** Catalogue metadata is display-only; payment snapshot remains authoritative. */
export async function packingCatalogue(snapshots:unknown[]){
  const ids=[...new Set(snapshots.flatMap(snapshot=>packingLines(snapshot,[]).map(line=>line.productId)))];
  if(!ids.length)return [];
  try{return await serverClient.fetch<PackingProduct[]>(`*[_type == 'product' && _id in $ids]{
    "id":_id,name,sku,"imageUrl":coalesce(heroImage.asset->url,gallery[defined(asset._ref)][0].asset->url),
    variants[]{"id":_key,title,colour,size,sku,"imageUrl":image.asset->url}
  }`,{ids},{cache:'no-store'});}catch{return [];}
}
