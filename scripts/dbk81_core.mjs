// DBK-81 scoped duplicated opening stock reversal — pure validation/planning.
// NEVER use this generic helper to rebase an entire catalogue.
export const PRODUCT_ID='product.dd576523bed244a68010efcc599fec69';
export const STORE_ID='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
export const ADJUSTMENTS=Object.freeze([
  {key:'80dab6c5-ea4',label:'vanilla', opening:138, before:275, after:137},
  {key:'f0715474-b72',label:'osmanthus',opening:50,before:100,after:50},
  {key:'526916e9-632',label:'raspberry',opening:50,before:100,after:50},
  {key:'b2e375b8-5b2',label:'Blue wind',opening:50,before:100,after:50},
]);
const assert=(value,message)=>{if(!value)throw new Error('STOP: '+message)};
const num=x=>typeof x==='number'?x:Number(x??0);
const vid=x=>x?.store?._ref||x?.storeId||'';
export function auditId(key){return `inventoryMovement.dbk81-opening-20261030-${key}`;}
export function planCorrection({product,inventoryRecords,movements,priorAudit=[]}){
  assert(product?._id===PRODUCT_ID,'product ID is not the expected Mini Scented Candle');
  assert(product._type==='product','record is not a product');
  assert(product._rev,'product revision missing');
  assert(product.name==='Mini Scented Candle','product name changed');
  assert(Array.isArray(inventoryRecords)&&inventoryRecords.length===1,'expected exactly one inventory record');
  const inv=inventoryRecords[0];
  assert(inv._type==='inventoryRecord'&&inv._rev,'inventory record or revision missing');
  assert(inv.product?._ref===PRODUCT_ID,'inventory is linked to a different product');
  assert(product.variants?.length===4,'expected exactly four variants');
  assert(inv.locationBalances?.length===1,'expected precisely one store allocation');
  const store=inv.locationBalances[0];
  assert(vid(store)===STORE_ID,'the stock is not all at the verified OTC Mall Branch');
  assert(store.variants?.length===4,'expected four store variant balances');
  assert(num(product.initialStock)===575,'product company stock differs from 575; sales/changes may have occurred');
  assert(num(store.onHand)===575,'store on-hand differs from 575; sales/changes may have occurred');
  assert(num(inv.incoming)===0&&num(store.incoming)===0,'incoming inventory is not zero');
  assert(num(inv.reserved)===0,'reserved stock is not zero');
  assert(!priorAudit.length,'DBK-81 adjustment has already been recorded');
  const pKeys=new Set(product.variants.map(v=>v._key));
  const iKeys=new Set(store.variants.map(v=>v.variantId));
  assert(pKeys.size===4&&iKeys.size===4,'duplicate variant identifiers found');
  let sumBefore=0,sumAfter=0,openingTotal=0;
  for(const a of ADJUSTMENTS){
    const p=product.variants.find(v=>v._key===a.key);
    const b=store.variants.find(v=>v.variantId===a.key);
    assert(p&&b,`missing variant ${a.label}`);
    assert(String(p.title||'').trim().toLowerCase()===a.label.toLowerCase(),`variant key ${a.key} now has a different title`);
    assert(num(p.stockQuantity)===a.before,`${a.label} product stock changed from ${a.before}`);
    assert(num(b.onHand)===a.before,`${a.label} location stock changed from ${a.before}`);
    assert(num(b.incoming)===0,`${a.label} incoming stock is not zero`);
    const receipts=(movements||[]).filter(m=>m.variantId===a.key&&m.movementType==='RECEIPT'&&!m.voidedAt);
    const purchases=(movements||[]).filter(m=>m.variantId===a.key&&m.movementType==='PURCHASE'&&!m.voidedAt);
    const total=rows=>rows.reduce((n,r)=>n+num(r.correctedQuantity??Math.abs(num(r.quantityChange))),0);
    assert(total(receipts)===a.opening,`${a.label}: active receipts do not equal ${a.opening}; investigate movement history`);
    assert(total(purchases)===a.opening,`${a.label}: active purchases do not equal ${a.opening}; investigate movement history`);
    assert(purchases.some(m=>num(m.stockBefore)===288),`${a.label}: no evidence of 288-unit opening balance before purchase`);
    sumBefore+=a.before;sumAfter+=a.after;openingTotal+=a.opening;
  }
  assert(sumBefore===575&&sumAfter===287&&openingTotal===288,'unexpected aggregate totals');
  assert(ADJUSTMENTS.every(a=>pKeys.has(a.key)&&iKeys.has(a.key)),'unexpected variant identifiers');
  const nextVariants=product.variants.map(v=>{const a=ADJUSTMENTS.find(x=>x.key===v._key);return {...v,stockQuantity:a.after};});
  const nextLocationBalances=inv.locationBalances.map(row=>({...row,onHand:287,
    variants:row.variants.map(b=>{const a=ADJUSTMENTS.find(x=>x.key===b.variantId);return {...b,onHand:a.after};})}));
  return {productId:PRODUCT_ID,inventoryId:inv._id,storeId:STORE_ID,productRevision:product._rev,inventoryRevision:inv._rev,
    before:575,duplicateOpening:288,after:287,adjustments:ADJUSTMENTS,
    nextVariants,nextLocationBalances, auditedMovementIds:ADJUSTMENTS.map(a=>auditId(a.key))};
}
