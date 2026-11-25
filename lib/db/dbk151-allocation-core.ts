export type AllocationRow = {locationId:string; variantId:string; quantity:number};
export type LegacyLocation = {locationId:string; onHand:number; incoming:number};

/** Validate a complete explicit allocation. Never infer colour/size from totals. */
export function validateAllocation(locations:LegacyLocation[], variantIds:string[], input:unknown): AllocationRow[] {
  if (!variantIds.length || variantIds.length>100 || new Set(variantIds).size!==variantIds.length || variantIds.some(id=>! /^[A-Za-z0-9._-]{1,100}$/.test(id) || id.startsWith('__UNALLOCATED'))) throw new Error('Invalid variant identifiers.');
  if (locations.some(l=>!Number.isSafeInteger(l.onHand)||l.onHand<0||!Number.isSafeInteger(l.incoming)||l.incoming<0)) throw new Error('Invalid live stock balance.');
  if (locations.some(l=>l.incoming>0)) throw new Error('Receive or reconcile outstanding incoming stock before converting variants.');
  if (!Array.isArray(input)||input.length>10000) throw new Error('Invalid allocation.');
  const allowed=new Map(locations.map(l=>[l.locationId,l.onHand]));
  const sums=new Map<string,number>(); const pairs=new Set<string>();
  const plan:AllocationRow[]=[];
  for(const row of input){
    if(!row || typeof row.locationId!=='string'||typeof row.variantId!=='string'||!allowed.has(row.locationId)||!variantIds.includes(row.variantId)||!Number.isSafeInteger(row.quantity)||row.quantity<0||row.quantity>1000000000) throw new Error('Enter valid whole-unit allocations for each store and variant.');
    const key=JSON.stringify([row.locationId,row.variantId]);
    if(pairs.has(key)) throw new Error('Duplicate store/variant allocation.'); pairs.add(key);
    sums.set(row.locationId,(sums.get(row.locationId)||0)+row.quantity);
    if(row.quantity>0) plan.push({locationId:row.locationId,variantId:row.variantId,quantity:row.quantity});
  }
  for(const l of locations) if((sums.get(l.locationId)||0)!==l.onHand) throw new Error(`Allocate exactly ${l.onHand} units at ${l.locationId}. Stock may have changed; reload and confirm.`);
  return plan.sort((a,b)=>a.locationId.localeCompare(b.locationId)||a.variantId.localeCompare(b.variantId));
}
