#!/usr/bin/env node
// DBK-80: Read-only Sanity document quota + single product stock-ledger diagnosis.
// No dataset mutations, no Neon writes, no payment API calls.
const project = (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID || '').trim();
const dataset = (process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_DATASET || 'production').trim();
const token = (process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN || '').trim();
if (project !== 'g34n810u' || dataset !== 'production' || !token) {
  console.error('STOP: Requires configured Sanity g34n810u.production and existing read/write token.');
  process.exit(1);
}
const productId = process.argv[2] || 'product.dd576523bed244a68010efcc599fec69';
if (!/^product\.[a-z0-9._-]+$/i.test(productId)) throw Error('Invalid product ID');
const query = `{
  "counts": {
    "all": count(*[]),
    "estimatedPlanDocuments": count(*[!(_type in ["sanity.imageAsset", "sanity.fileAsset", "sanity.videoAsset", "sanity.tree", "sanity.directory", "sanity.symlink", "sanity.assist.task.status"] || _type match "system.*")]),
    "auditEvent": count(*[_type == "auditEvent"]),
    "staffSession": count(*[_type == "staffSession"]),
    "endedStaffSession": count(*[_type == "staffSession" && status == "ENDED"]),
    "inventoryMovement": count(*[_type == "inventoryMovement"]),
    "commerceOrder": count(*[_type == "commerceOrder"]),
    "paymentTransaction": count(*[_type == "paymentTransaction"]),
    "product": count(*[_type == "product"]),
    "inventoryRecord": count(*[_type == "inventoryRecord"]),
    "customerUser": count(*[_type == "customerUser"]),
    "clientError": count(*[_type == "clientError"]),
    "shipment": count(*[_type == "shipment"]),
    "expense": count(*[_type == "expense"]),
    "expenditure": count(*[_type == "expenditure"]),
    "restockRequest": count(*[_type == "restockRequest"])
  },
  "product": *[_type == "product" && _id == $productId][0]{
    _id,_rev,name,sku,initialStock,
    "variants": variants[]{_key,title,colour,size,sku,stockQuantity},
    "inventory": *[_type == "inventoryRecord" && product._ref == ^._id]{
      _id,_rev,incoming,reserved,
      "locationBalances": locationBalances[]{
        "storeId": coalesce(store._ref,storeId),storeName,onHand,incoming,
        "variants": variants[]{variantId,variantLabel,onHand,incoming}
      }
    }
  },
  "recentMovements": *[_type == "inventoryMovement" && (productId == $productId || product._ref == $productId)] | order(createdAt desc)[0..79]{
    _id,createdAt,movementNumber,movementType,variantId,variantLabel,
    quantityChange,stockBefore,stockAfter,incomingBefore,incomingAfter,
    sourceLocation,destination,voidedAt,correctedQuantity
  }
}`;
const u = new URL(`https://${project}.api.sanity.io/v2025-02-19/data/query/${dataset}`);
u.searchParams.set('query',query);
u.searchParams.set('$productId',JSON.stringify(productId));
const r = await fetch(u,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
if (!r.ok) throw Error(`Sanity query HTTP ${r.status}: ${(await r.text()).slice(0,500)}`);
const body = await r.json();
if (body.error || !body.result || !body.result.counts) throw Error(`Sanity query returned error: ${JSON.stringify(body.error || body).slice(0,500)}`);
const result = body.result;
const quota = result.counts.estimatedPlanDocuments;
console.log(JSON.stringify({
  stage:'DBK-80',mode:'READ_ONLY',checkedAt:new Date().toISOString(),productId,
  quota:{...result.counts,projectLimit:25000,estimatedHeadroom:Math.max(0,25000-quota),documentsToReach10000:Math.max(0,quota-10000)},
  product:result.product, recentMovements:result.recentMovements,
  caution:'Read-only data: no cleanup, no stock correction. Do not share customer PII, tokens, or complete production export.'
},null,2));
