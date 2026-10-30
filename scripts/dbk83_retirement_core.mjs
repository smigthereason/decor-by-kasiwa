import {createHash} from 'node:crypto';
export const PINNED_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export const APPROVAL='RETIRE_DBK83_VERIFIED_HISTORIC_MOVEMENTS';
export const RETENTION_MS=7*24*3600000;
export function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export const hashDoc=doc=>createHash('sha256').update(JSON.stringify(canonical(doc))).digest('hex');
export function retirementCandidate(doc,live,archived,now){
  if(!doc || doc._type!=='inventoryMovement' || !doc._id?.startsWith('inventoryMovement.') || !doc._rev)return 'invalid';
  if(!['PURCHASE','RECEIPT','TRANSFER'].includes(doc.movementType)||typeof doc.productId!=='string'||!doc.createdAt)return 'unsupported';
  if(!live || live._rev!==doc._rev)return 'live_revision_changed';
  const created=Date.parse(doc._createdAt||''), updated=Date.parse(doc._updatedAt||'');
  if(!Number.isFinite(created)||!Number.isFinite(updated)||Math.max(created,updated)>now-RETENTION_MS)return 'retained_last_7_days';
  if(!archived || archived.source_revision!==doc._rev || archived.source_sha256!==hashDoc(doc))return 'archive_not_exact';
  return null;
}
export function requireCommitAuthorization({requested, flags,host,age,bytes,expectedSha,actualSha}){
  if(host!==PINNED_HOST || !expectedSha || expectedSha!==actualSha || age<0 || age>2*3600000 || bytes<100000)throw Error('Fresh pinned backup required');
  if(requested && (!flags?.reads || !flags?.restore || !flags?.approval))throw Error('Missing deployed read, restore or operator proof');
}
