import { reconcileRows } from './dbk54_reconcile_core.mjs';

export const PINNED_DB_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export const PINNED_PROJECT='g34n810u';

export function normalizeRows(rows) {
  if(!Array.isArray(rows)) throw Error('Rows must be an array');
  const map=new Set();
  return rows.map(r=>{
    if(!r || !r.product_id || typeof r.variant_id!=='string' || !r.location_id || !r.product_revision || !r.inventory_revision || !r.seed_fingerprint) throw Error('Incomplete row');
    const id=JSON.stringify([r.product_id,r.variant_id,r.location_id]);
    if(map.has(id)) throw Error('Duplicate row '+id);
    map.add(id);
    const on_hand=Number(r.on_hand),incoming=Number(r.incoming);
    if(!Number.isSafeInteger(on_hand)||on_hand<0||!Number.isSafeInteger(incoming)||incoming<0) throw Error('Bad quantity');
    return {product_id:String(r.product_id),variant_id:r.variant_id,location_id:String(r.location_id),on_hand,incoming,product_revision:String(r.product_revision),inventory_revision:String(r.inventory_revision),seed_fingerprint:String(r.seed_fingerprint)};
  }).sort((a,b)=>JSON.stringify([a.product_id,a.variant_id,a.location_id]).localeCompare(JSON.stringify([b.product_id,b.variant_id,b.location_id])));
}
export function buildCandidate(rows,fingerprint){
  if(!/^[a-f0-9]{64}$/.test(fingerprint)) throw Error('Invalid fingerprint');
  return normalizeRows(rows.map(row=>({...row,seed_fingerprint:fingerprint})));
}
export function readiness({source, before, revisions, frozen, gates, operations, fingerprint, callbacks, paidUncommitted, legacyReceivables}) {
  const diff=reconcileRows(source,before);
  const blockers=[];
  if(!revisions?.exactMatch) blockers.push('Sanity source revisions differ from export');
  if(!Number.isInteger(operations)||operations!==0) blockers.push('Neon stock operations exist or could not be read');
  if(!Array.isArray(gates)||gates.length!==10||gates.some(g=>typeof g.enabled!=='boolean'||g.enabled)) blockers.push('Neon transaction gates not all disabled');
  if(frozen!==true) blockers.push('Write freeze has not been confirmed');
  if(!/^[a-f0-9]{64}$/.test(fingerprint||'')) blockers.push('Initial Neon fingerprint invalid');
  if(callbacks!==0) blockers.push('Unreconciled provider callbacks');
  if(paidUncommitted!==0) blockers.push('Paid but uncommitted stock exceptions');
  if(!legacyReceivables || legacyReceivables.count>0) blockers.push('Legacy receivable finance bridge not verified');
  return {diff,blockers,stockSyncReady:blockers.filter(x=>!x.startsWith('Legacy receivable') && !x.startsWith('Unreconciled provider') && !x.startsWith('Paid but uncommitted')).length===0,fullCutoverReady: blockers.length===0};
}
