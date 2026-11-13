#!/usr/bin/env node
// DBK-81: One-time, exact-product, revision-bound atomic Sanity stock correction.
// Defaults to REVIEW ONLY. --apply requires explicit full confirmation string.
import {planCorrection,PRODUCT_ID,STORE_ID,auditId,ADJUSTMENTS} from './dbk81_core.mjs';
const confirmation='DBK81-APPLY-288-OPENING-TO-287';
const applying=process.argv.length===3&&process.argv[2]==='--apply='+confirmation;
if(process.argv.length!==2&&!applying){console.error('Usage: node --env-file=.env.local scripts/dbk81_fix_opening_stock.mjs [--apply='+confirmation+']');process.exit(2);}
const env=process.env;
const project=(env.NEXT_PUBLIC_SANITY_PROJECT_ID||'').trim(),dataset=(env.NEXT_PUBLIC_SANITY_DATASET||'production').trim();
if(project!=='g34n810u'||dataset!=='production')throw Error('STOP: expected pinned Sanity g34n810u.production');
if((env.DBK_INVENTORY_BACKEND||'').toLowerCase()==='neon')throw Error('STOP: local env selects Neon stock; refusing Sanity correction');
const token=(applying?env.SANITY_API_WRITE_TOKEN:(env.SANITY_API_READ_TOKEN||env.SANITY_API_WRITE_TOKEN)||'').trim();
if(!token)throw Error('STOP: '+(applying?'SANITY_API_WRITE_TOKEN':'Sanity read/write token')+' required');
const {createClient}=await import('@sanity/client');
const sanity=createClient({projectId:project,dataset,apiVersion:'2026-08-27',useCdn:false,token,perspective:'published'});
const [product,inventoryRecords,movements,priorAudit]=await Promise.all([
  sanity.fetch('*[_id == $id][0]',{id:PRODUCT_ID},{cache:'no-store'}),
  sanity.fetch('*[_type == "inventoryRecord" && product._ref == $id]',{id:PRODUCT_ID},{cache:'no-store'}),
  sanity.fetch('*[_type == "inventoryMovement" && (productId == $id || product._ref == $id)] | order(createdAt desc)[0...501]{_id,movementType,variantId,quantityChange,correctedQuantity,voidedAt,stockBefore,createdAt}',{id:PRODUCT_ID},{cache:'no-store'}),
  sanity.fetch('*[_type == "inventoryMovement" && _id in $ids]{_id}',{ids:ADJUSTMENTS.map(a=>auditId(a.key))},{cache:'no-store'}),
]);
if(movements.length>=501)throw Error('STOP: more than 500 movements; incomplete history');
const p=planCorrection({product,inventoryRecords,movements,priorAudit});
const summary={stage:'DBK-81',mode:applying?'REVIEW_BEFORE_ATOMIC_APPLY':'READ_ONLY_REVIEW',productId:p.productId,
  productName:product.name,branch:'OTC Mall Branch',before:p.before,duplicateOpening:p.duplicateOpening,after:p.after,
  variants:p.adjustments.map(a=>({name:a.label,currently:a.before,openingDuplicate:a.opening,corrected:a.after})),
  incomingUnchanged:0,purchasesAndReceiptsPreserved:true,salesPreserved:true,
  productRevision:p.productRevision,inventoryRevision:p.inventoryRevision,
  warning:'Verify shop physical inventory before applying. If balances changed, script FAILS CLOSED.'};
console.log(JSON.stringify(summary,null,2));
if(!applying){console.log('\nREAD ONLY. No Sanity documents changed. To apply after verifying receipt/physical count, see README.');process.exit(0)}
// No generic mutate capability: exactly two known stock documents + four immutable adjustment movements.
const now=new Date().toISOString();
const tx=sanity.transaction();
tx.patch(p.productId,patch=>patch.ifRevisionId(p.productRevision).set({initialStock:p.after,variants:p.nextVariants,available:true}));
tx.patch(p.inventoryId,patch=>patch.ifRevisionId(p.inventoryRevision).set({locationBalances:p.nextLocationBalances}));
let before=p.before;
for(const a of p.adjustments){
  const after=before-a.opening;
  tx.create({_id:auditId(a.key),_type:'inventoryMovement',
    movementNumber:`DBK-81-OPENING-${a.key.toUpperCase()}`,movementType:'ADJUSTMENT',
    product:{_type:'reference',_ref:PRODUCT_ID},productId:PRODUCT_ID,productName:'Mini Scented Candle',
    variantId:a.key,variantLabel:a.label,quantityChange:-a.opening,stockBefore:before,stockAfter:after,
    incomingBefore:0,incomingAfter:0,sourceLocation:'Duplicate new-product opening balance correction',
    destination:'OTC Mall Branch',destinationStore:{_type:'reference',_ref:STORE_ID},
    actorName:'DBK-81 audited production inventory correction',actorRole:'ADMIN',
    note:'Duplicate opening balance entered on product creation and later purchased/received again; correcting ORIGINAL opening only. Historical purchase, receipt, and SALE records retained. Verified original company balance 575, target 287 (288 received minus 1 sale).',
    createdAt:now});
  before=after;
}
if(before!==287)throw Error('STOP: adjustment total inconsistent');
await tx.commit({tag:'dbk81.inventory.opening-correction'});
const [checkProduct,checkInventory,checkAudit]=await Promise.all([
  sanity.fetch('*[_id == $id][0]{initialStock,variants[]{_key,stockQuantity}}',{id:PRODUCT_ID},{cache:'no-store'}),
  sanity.fetch('*[_id == $id][0]{locationBalances[]{onHand,incoming,variants[]{variantId,onHand,incoming}}}',{id:p.inventoryId},{cache:'no-store'}),
  sanity.fetch('count(*[_type == "inventoryMovement" && _id in $ids])',{ids:p.auditedMovementIds},{cache:'no-store'})
]);
if(checkProduct.initialStock!==287||checkInventory.locationBalances[0]?.onHand!==287||checkAudit!==4)
  throw Error('COMMIT COMPLETED, BUT POST-VERIFICATION FAILED. Do NOT re-run. Inspect Sanity data immediately.');
console.log(JSON.stringify({status:'DBK81_APPLIED_AND_VERIFIED',companyOnHand:287,branchOnHand:287,auditedAdjustmentRecords:4,productVariantBalances:checkProduct.variants},null,2));
