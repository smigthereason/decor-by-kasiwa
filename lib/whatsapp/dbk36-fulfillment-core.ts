/** DBK-36 v21: pure paid-order-to-inventory planner. No IO, no payments, no writes.
 * Authoritative inventory remains Sanity until the separately approved DBK-69 cutover.
 */
export type PaidIntake = {
  reference:string; provider_receipt:string; wa_id:string; checkout_id:string;
  amount_minor:number|string; cart_snapshot:unknown; verification_mode:string;
  intake_status:string; attested_by:string;
};
export type PaidCartLine={productId:string;variantId:string;quantity:number;subtotalMinor:number};
export type CatalogueProduct={
  id:string;price:number;available?:boolean;ecommerceEnabled?:boolean;
  variants?:Array<{id:string;price?:number}>;
};
export type StockVariant={_key?:string;stockQuantity?:number;title?:string;colour?:string;size?:string;[key:string]:unknown};
export type LocationBalance={
  _key?:string;store?:{_type?:string;_ref?:string}|null;storeId?:string;storeName?:string;storeCode?:string;
  onHand?:number|null;incoming?:number|null;
  variants?:Array<{_key?:string;variantId?:string;variantLabel?:string;onHand?:number|null;incoming?:number|null}>|null;
};
export type InventoryDocument={_id:string;_rev:string;locationBalances?:LocationBalance[]|null};
export type ProductSnapshot={
  _id:string;_rev:string;name?:string;initialStock?:number;available?:boolean;
  variants?:StockVariant[]|null;inventory?:InventoryDocument|null;
};
export type ProductPlan={
  productId:string;productRev:string;inventoryId:string;inventoryRev:string;
  newInitialStock:number;newVariants:StockVariant[]|null;newLocationBalances:LocationBalance[];
};
export type StockPlan={reference:string;receipt:string;waId:string;amountMinor:number;
  storeId:string;lines:PaidCartLine[];products:ProductPlan[]};

const REF=/^DBKWA[A-Z0-9]{7}$/;
const REC=/^[A-Za-z0-9-]{6,30}$/;
const PHONE=/^254(?:7|1)\d{8}$/;
const safe=(value:unknown)=>typeof value==='number' && Number.isSafeInteger(value) && value>=0;
function requireTrue(test:boolean,code:string):asserts test{if(!test)throw new Error(code);}
function priceMinor(value:unknown){
  if(typeof value!=='number'||!Number.isFinite(value))return NaN;
  const minor=Math.round(value*100);
  return Math.abs(minor-value*100)<0.000001&&Number.isSafeInteger(minor)?minor:NaN;
}
export function validatePaidIntake(source:PaidIntake):{amountMinor:number;lines:PaidCartLine[]}{
  requireTrue(REF.test(source.reference)&&REC.test(source.provider_receipt)&&PHONE.test(source.wa_id), 'PAID_SOURCE_IDENTITY_INVALID');
  requireTrue((source.verification_mode==='staff_till_attested'||
    (source.verification_mode==='daraja_api_verified'&&source.attested_by==='DBK36_DARAJA_QUERY'))&&
    Boolean(source.attested_by)&&source.intake_status==='AWAITING_STAFF_STOCK_REVIEW',
    'VERIFIED_PAID_INTAKE_REQUIRED');
  const amount=Number(source.amount_minor);
  requireTrue(safe(amount)&&amount>=100&&amount<=50000,'PAID_AMOUNT_INVALID');
  requireTrue(Array.isArray(source.cart_snapshot)&&source.cart_snapshot.length>0&&source.cart_snapshot.length<=12,'PAID_CART_INVALID');
  const keys=new Set<string>();const lines:PaidCartLine[]=[];let sum=0;
  for(const raw of source.cart_snapshot){
    requireTrue(Boolean(raw)&&typeof raw==='object'&&!Array.isArray(raw),'CART_LINE_INVALID');
    const item=raw as Record<string,unknown>;
    const id=item.productId,variant=item.variantId??'';
    const quantity=item.quantity,subtotal=item.subtotalMinor;
    requireTrue(typeof id==='string'&&id.length>0&&id.length<=180&&
      typeof variant==='string'&&variant.length<=180&&safe(quantity)&&Number(quantity)>=1&&Number(quantity)<=20&&
      safe(subtotal)&&Number(subtotal)>=100&&Number(subtotal)%Number(quantity)===0,'CART_LINE_INVALID');
    const key=`${id}|${variant}`;
    requireTrue(!keys.has(key),'DUPLICATE_CART_LINE');keys.add(key);
    lines.push({productId:id,variantId:variant,quantity:Number(quantity),subtotalMinor:Number(subtotal)});
    sum+=Number(subtotal);
  }
  requireTrue(Number.isSafeInteger(sum)&&sum===amount,'PAID_TOTAL_MISMATCH');
  return {amountMinor:amount,lines};
}
function storeBalance(doc:InventoryDocument,storeId:string):{row:LocationBalance;index:number}{
  const balances=doc.locationBalances;
  requireTrue(Array.isArray(balances),'LOCATION_STOCK_UNAVAILABLE');
  const matching=balances.map((row,index)=>({row,index})).filter(x=>(x.row.store?._ref||x.row.storeId)===storeId);
  requireTrue(matching.length===1,'STORE_LOCATION_BALANCE_NOT_UNIQUE');
  return matching[0];
}
/** Fail closed on duplicate products, unknown variants/stock, price changes and quantity conflicts. */
export function planStockDeduction(source:PaidIntake,catalogue:CatalogueProduct[],stock:ProductSnapshot[],storeId:string):StockPlan{
  requireTrue(/^storeLocation\.[A-Za-z0-9]{20,100}$/.test(storeId),'STORE_PIN_INVALID');
  const {amountMinor,lines}=validatePaidIntake(source);
  requireTrue(Array.isArray(catalogue)&&Array.isArray(stock),'AUTHORITATIVE_STOCK_UNAVAILABLE');
  const c=new Map(catalogue.map(x=>[x.id,x]));const s=new Map(stock.map(x=>[x._id,x]));
  const perProduct=new Map<string,PaidCartLine[]>();
  for(const l of lines){perProduct.set(l.productId,[...(perProduct.get(l.productId)||[]),l]);}
  const mutations:ProductPlan[]=[];
  for(const [id,group] of perProduct){
    const product=s.get(id),item=c.get(id);
    requireTrue(Boolean(product)&&Boolean(item)&&item!.available!==false&&item!.ecommerceEnabled!==false,'PRODUCT_NOT_SELLABLE');
    requireTrue(Boolean(product!._rev)&&Boolean(product!.inventory?._id)&&Boolean(product!.inventory?._rev),'INVENTORY_REVISION_MISSING');
    const doc=product!.inventory!;
    const {row,index}=storeBalance(doc,storeId);
    const nextBalances=(doc.locationBalances||[]).map(x=>({...x,variants:x.variants?.map(v=>({...v}))}));
    const branch=nextBalances[index];
    const variants=product!.variants||[];
    const sellVariants=item!.variants||[];
    requireTrue((variants.length===0)===(sellVariants.length===0),'VARIANT_CATALOGUE_DRIFT');
    const newVariants=variants.map(v=>({...v}));
    let totalQty=0;
    for(const l of group){
      totalQty+=l.quantity;
      const saleVariant=l.variantId?sellVariants.find(v=>v.id===l.variantId):undefined;
      requireTrue(variants.length===0?!l.variantId:Boolean(l.variantId&&saleVariant),'VARIANT_REQUIRED_OR_INVALID');
      const salePrice=saleVariant?.price??item!.price;
      requireTrue(priceMinor(salePrice)>0&&priceMinor(salePrice)*l.quantity===l.subtotalMinor,'PAID_PRICE_CHANGED');
      if(l.variantId){
        const vi=newVariants.findIndex(v=>v._key===l.variantId);
        requireTrue(vi!==-1&&safe(newVariants[vi].stockQuantity),'VARIANT_STOCK_UNKNOWN');
        const existing=Number(newVariants[vi].stockQuantity);
        requireTrue(existing>=l.quantity,'GLOBAL_VARIANT_STOCK_INSUFFICIENT');
        newVariants[vi].stockQuantity=existing-l.quantity;
        const bi=branch.variants?.findIndex(v=>v.variantId===l.variantId)??-1;
        requireTrue(bi>=0&&safe(branch.variants![bi].onHand),'BRANCH_VARIANT_STOCK_UNKNOWN');
        const balance=Number(branch.variants![bi].onHand);
        requireTrue(balance>=l.quantity,'BRANCH_VARIANT_STOCK_INSUFFICIENT');
        branch.variants![bi].onHand=balance-l.quantity;
      }else{
        requireTrue(safe(branch.onHand),'BRANCH_STOCK_UNKNOWN');
        const available=Number(branch.onHand);
        requireTrue(available>=l.quantity,'BRANCH_STOCK_INSUFFICIENT');
        branch.onHand=available-l.quantity;
      }
    }
    let nextGlobal:number;
    if(variants.length){
      requireTrue(newVariants.every(v=>safe(v.stockQuantity)),'GLOBAL_VARIANT_STOCK_UNKNOWN');
      nextGlobal=newVariants.reduce((total,v)=>total+Number(v.stockQuantity),0);
      branch.onHand=branch.variants!.reduce((total,v)=>total+Number(v.onHand||0),0);
    }else{
      requireTrue(safe(product!.initialStock),'GLOBAL_STOCK_UNKNOWN');
      requireTrue(Number(product!.initialStock)>=totalQty,'GLOBAL_STOCK_INSUFFICIENT');
      nextGlobal=Number(product!.initialStock)-totalQty;
    }
    requireTrue(Number.isSafeInteger(nextGlobal)&&nextGlobal>=0,'STOCK_RESULT_INVALID');
    mutations.push({productId:id,productRev:product!._rev,inventoryId:doc._id,inventoryRev:doc._rev,
      newInitialStock:nextGlobal,newVariants:variants.length?newVariants:null,newLocationBalances:nextBalances});
  }
  return {reference:source.reference,receipt:source.provider_receipt,waId:source.wa_id,
    amountMinor,storeId,lines,products:mutations};
}
