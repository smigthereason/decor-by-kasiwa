/** Upserts one missing canonical Sanity taxonomy record only with explicit approval. */
import { createClient } from '@sanity/client';
const projectId=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim();
const dataset=(process.env.NEXT_PUBLIC_SANITY_DATASET||'production').trim();
const token=process.env.SANITY_API_WRITE_TOKEN?.trim().replace(/^["']|["']$/g,'');
if(projectId!=='g34n810u'||dataset!=='production')throw Error('Unexpected Sanity project/dataset: stopping');
if(!token)throw Error('Missing SANITY_API_WRITE_TOKEN');
const client=createClient({projectId,dataset,token,apiVersion:'2026-08-27',useCdn:false,perspective:'raw'});
const id='dbk-category-bathroom-and-kitchen';
const slug='bathroom-and-kitchen';
const matches=await client.fetch(`*[_type == "category" && (_id == $id || slug.current == $slug || title == $title)]{_id,title,"slug":slug.current,active,showInNavigation}`,
  {id,slug,title:'Bathroom & Kitchen'});
const exact=matches.find(x=>x._id===id);
const conflicts=matches.filter(x=>x._id!==id);
if(conflicts.length)throw Error(`Review existing matching Sanity categories before writing: ${conflicts.map(x=>x._id).join(', ')}`);
const plan={stage:'DBK122_CATEGORY_REPAIR',projectId,dataset,source:'storefront fallback taxonomy',canonicalId:id,
  exists:Boolean(exact),active:exact?.active,showInNavigation:exact?.showInNavigation,
  action:exact?'DO_NOT_OVERWRITE_EXISTING':'CREATE_CANONICAL_CATEGORY_ONLY',
  createsProducts:false,changesStock:false,changesPayments:false};
console.log(JSON.stringify(plan,null,2));
if(!process.argv.includes('--apply'))process.exit(0);
if(process.env.DBK122_CATEGORY_SYNC_APPROVED!=='YES')throw Error('Set DBK122_CATEGORY_SYNC_APPROVED=YES after reviewing the plan');
if(exact){console.log('Existing category preserved unchanged.');process.exit(0);}
const doc={_id:id,_type:'category',title:'Bathroom & Kitchen',slug:{_type:'slug',current:slug},displayOrder:100,
  showInNavigation:true,active:true,description:'Bathroom and kitchen accessories'};
await client.createIfNotExists(doc);
const verified=await client.fetch(`*[_id == $id][0]{_id,title,"slug":slug.current}`,{id});
if(!verified||verified.slug!==slug)throw Error('Category write did not verify');
console.log(JSON.stringify({stage:'DBK122_CATEGORY_CREATED',id:verified._id,slug:verified.slug,productsChanged:false,stockChanged:false},null,2));
