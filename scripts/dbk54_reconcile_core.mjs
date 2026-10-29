// DBK-54 pure comparator: requires a freshly validated Sanity export plan.
export function reconcileRows(sourceRows, targetRows, limit = 30) {
  const key = r => `${r.product_id}\0${r.variant_id}\0${r.location_id}`;
  const safeUnits = (raw, label) => {
    const number = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid ${label}: ${String(raw)}`);
    return number;
  };
  const createMap = (rows, label) => {
    const result = new Map();
    for (const row of rows) {
      if (!row || typeof row.product_id !== 'string' || !row.product_id || typeof row.variant_id !== 'string' ||
          typeof row.location_id !== 'string' || !row.location_id) throw new Error(`${label}: malformed stock row`);
      const id = key(row);
      if (result.has(id)) throw new Error(`${label}: duplicate key ${id}`);
      result.set(id, { ...row, on_hand:safeUnits(row.on_hand,'on_hand'), incoming:safeUnits(row.incoming,'incoming') });
    }
    return result;
  };
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows)) throw new Error('Expected source and target arrays');
  const src = createMap(sourceRows,'Sanity');
  const dst = createMap(targetRows,'Neon');
  const changes = [];
  let added=0, removed=0, changed=0, deltaOnHand=0, deltaIncoming=0;
  for (const id of new Set([...src.keys(), ...dst.keys()])) {
    const a = src.get(id), b = dst.get(id);
    if (a && b && a.on_hand === b.on_hand && a.incoming === b.incoming) continue;
    if (!b) added++;
    else if (!a) removed++;
    else changed++;
    const onHandDiff = (a?.on_hand || 0) - (b?.on_hand || 0);
    const incomingDiff = (a?.incoming || 0) - (b?.incoming || 0);
    deltaOnHand+=onHandDiff; deltaIncoming+=incomingDiff;
    changes.push({ productId:(a||b).product_id,variantId:(a||b).variant_id,
      storeId:(a||b).location_id, sanityOnHand:a?.on_hand??null, neonOnHand:b?.on_hand??null,
      onHandDifference:onHandDiff, incomingDifference:incomingDiff,
      status:!b?'new_in_sanity':!a?'missing_in_sanity':'quantity_changed' });
  }
  changes.sort((a,b)=> Math.abs(b.onHandDifference)-Math.abs(a.onHandDifference) ||
    a.productId.localeCompare(b.productId));
  return { sourceRows:src.size,targetRows:dst.size,matchedRows:src.size-added-changed,
    addedInSanity:added,missingInSanity:removed,changedRows:changed,
    stockDifference:deltaOnHand,incomingDifference:deltaIncoming,
    inSync:changes.length===0,changeCount:changes.length,
    topChanges:changes.slice(0,limit) };
}
