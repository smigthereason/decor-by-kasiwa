/**
 * DBK-23A: targeted, opt-in reconciliation of the 15 historical ecommerce
 * location-ledger differences verified in DBK-22. Does NOT consolidate stores,
 * alter product/variant company stock, or approve any other DBK-23 issue.
 *
 * First run in dry mode, approve an exact live snapshot, back up production,
 * pause sales, and only then execute with explicit flags.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getCliClient } from "sanity/cli";

type Candidate = { productId: string; variantId: string; name: string; variantName: string; company: number; allocated: number; onlineUnits: number };
const candidates: Candidate[] = [
  {"productId": "dbk-product-0097-essential-oil", "variantId": "087216e2-90e", "name": "Essential Oil", "variantName": "lime", "company": 53, "allocated": 54, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "cdf9fd27-b54", "name": "Essential Oil", "variantName": "white tea", "company": 44, "allocated": 45, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "9ed8d573-f64", "name": "Essential Oil", "variantName": "rose", "company": 47, "allocated": 48, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "2ac5034c-ba8", "name": "Essential Oil", "variantName": "cherry blossom", "company": 44, "allocated": 45, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "b9cf3fb9-273", "name": "Essential Oil", "variantName": "ocean", "company": 41, "allocated": 42, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "00c7c5d1-d2f", "name": "Essential Oil", "variantName": "lavender", "company": 33, "allocated": 35, "onlineUnits": 2},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "12740390-30f", "name": "Essential Oil", "variantName": "coffee", "company": 45, "allocated": 46, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "56c0ef37-152", "name": "Essential Oil", "variantName": "gardendia", "company": 45, "allocated": 46, "onlineUnits": 1},
  {"productId": "dbk-product-0097-essential-oil", "variantId": "276065b3-6e2", "name": "Essential Oil", "variantName": "citrus", "company": 32, "allocated": 34, "onlineUnits": 2},
  {"productId": "dbk-product-0148-7-cm-rose-petals", "variantId": "6449f9b7-e5e", "name": "7 Cm Rose Petals", "variantName": "pink big petals", "company": 1475, "allocated": 1490, "onlineUnits": 15},
  {"productId": "dbk-product-0148-7-cm-rose-petals", "variantId": "d93c49a1-e91", "name": "7 Cm Rose Petals", "variantName": "baby pink big petals", "company": 1461, "allocated": 1476, "onlineUnits": 15},
  {"productId": "dbk-product-0148-7-cm-rose-petals", "variantId": "af9840ff-9b9", "name": "7 Cm Rose Petals", "variantName": "white big petals", "company": 1464, "allocated": 1474, "onlineUnits": 10},
  {"productId": "dbk-product-0183-3-5-cm-rose-petals", "variantId": "bc333107-268", "name": "3.5 Cm Rose Petals", "variantName": "White", "company": 14645, "allocated": 14650, "onlineUnits": 5},
  {"productId": "product.b10e878b982a48d39f1fd09400b83644", "variantId": "c6fbfa64-6d6", "name": "Aromer Essential Oil Diffuser", "variantName": "White / 250 ML", "company": 0, "allocated": 1, "onlineUnits": 1},
  {"productId": "product.fa889a37964b4a519e2b5e24357e9bc2", "variantId": "d0b56beb-8a6", "name": "Reed difuser", "variantName": "hilton", "company": 42, "allocated": 44, "onlineUnits": 2},
];
const client = getCliClient().withConfig({ apiVersion: "2026-08-27", useCdn: false, perspective: "published" });
const storeId = process.env.DBK_MAIN_STORE_ID?.trim();
const write = process.env.DBK_23A_WRITE === "1";
const approvedFile = process.env.DBK_23A_APPROVALS_PATH;
const confirmed = process.env.DBK_23A_CONFIRM === "RECONCILE_15_ONLINE_LEDGER";
const outFile = "DBK-23A-online-ledger-review.csv";

type Product = { _id: string; _rev: string; name?: string; initialStock?: number; variants?: Array<{ _key?: string; stockQuantity?: number }> };
type VariantLedger = { _key?: string; variantId?: string; onHand?: number; incoming?: number };
type Balance = { _key?: string; store?: { _ref?: string }; storeId?: string; onHand?: number; incoming?: number; variants?: VariantLedger[] };
type Inventory = { _id: string; _rev: string; productId?: string; reserved?: number; locationBalances?: Balance[] };
type Sale = { _id: string; salesChannel?: string; lineItems?: Array<{ productId?: string; variantId?: string; quantity?: number }> };
type Movement = { _id: string; productId?: string; variantId?: string; movementType?: string; quantityChange?: number };
type Return = { _id: string; status?: string; restock?: boolean; items?: Array<{ productId?: string; variantId?: string; quantity?: number }> };
type Review = { productId: string; name: string; variantId: string; variantName: string; company: number; ledgerBefore: number; adjustment: number; onlinePaidUnits: number; productRev: string; inventoryRev: string; mainStoreId: string; approval: string; reason: string };
type Change = { item: Candidate; product: Product; inventory: Inventory; updatedBalances: Balance[]; review: Review };
const key = (p: string, v: string) => `${p}|${v}`;
const quantity = (n: unknown, field: string): number => {
  const x = n == null ? 0 : Number(n);
  if (!Number.isSafeInteger(x) || x < 0) throw new Error(`${field}: invalid nonnegative stock quantity ${JSON.stringify(n)}`);
  return x;
};
const refId = (b: Balance) => b.store?._ref || b.storeId || "";
const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
function parseCsv(value: string): string[][] {
  const output: string[][] = []; let row: string[] = []; let part = ""; let quoted = false;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"') {
      if (quoted && value[i+1] === '"') { part += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (value[i] === "," || value[i] === "\n")) {
      row.push(part); part = "";
      if (value[i] === "\n") { output.push(row); row = []; }
    } else if (value[i] !== "\r" || quoted) part += value[i];
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (part || row.length) { row.push(part); output.push(row); }
  return output;
}
function approvals(path?: string): Map<string, Review> {
  const result = new Map<string, Review>();
  if (!path) return result;
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows.shift() || [];
  const required = ["productId","variantId","company","ledgerBefore","adjustment","onlinePaidUnits","productRev","inventoryRev","mainStoreId","approval","reason"];
  for (const field of required) if (!header.includes(field)) throw new Error(`Approval CSV missing ${field}`);
  for (const cells of rows) {
    if (!cells.some(Boolean)) continue;
    const data = Object.fromEntries(header.map((h,i) => [h,cells[i] ?? ""])) as unknown as Review;
    const k = key(data.productId,data.variantId);
    if (result.has(k)) throw new Error(`Duplicate approval ${k}`);
    result.set(k,data);
  }
  return result;
}
function movementId(c: Candidate) {
  return `inventoryMovement.dbk23a-${createHash("sha1").update(key(c.productId,c.variantId)).digest("hex").slice(0,24)}`;
}
async function main() {
  if (!storeId) throw new Error("Set DBK_MAIN_STORE_ID to the actual Main store ID.");
  if (write && (!confirmed || !approvedFile)) throw new Error("WRITE blocked: provide approved CSV and DBK_23A_CONFIRM=RECONCILE_15_ONLINE_LEDGER, after backup and pausing sales.");
  const stores = await client.fetch<Array<{_id:string;name:string}>>(`*[_type=="storeLocation" && locationType=="MAIN" && active!=false]{_id,name}`);
  const store = stores.find(s=>s._id === storeId);
  if (!store) throw new Error(`${storeId} is not an active Main store`);
  const ids = [...new Set(candidates.map(c=>c.productId))];
  const [products, inventories, paidOrders, movements, returns, existingAdjustments] = await Promise.all([
    client.fetch<Product[]>(`*[_type=="product" && _id in $ids && !(_id in path("drafts.**"))]{_id,_rev,name,initialStock,variants[]{_key,stockQuantity}}`,{ids}),
    client.fetch<Inventory[]>(`*[_type=="inventoryRecord" && product._ref in $ids && !(_id in path("drafts.**"))]{_id,_rev,"productId":product._ref,reserved,locationBalances[]{_key,store,storeId,onHand,incoming,variants[]{_key,variantId,onHand,incoming}}}`,{ids}),
    client.fetch<Sale[]>(`*[_type=="commerceOrder" && paymentStatus in ["paid","partially_paid","refunded"] && !(_id in path("drafts.**"))]{_id,salesChannel,lineItems[]{"productId":coalesce(productId,product._ref),variantId,quantity}}`),
    client.fetch<Movement[]>(`*[_type=="inventoryMovement" && coalesce(productId,product._ref) in $ids && !(_id in path("drafts.**"))]{_id,"productId":coalesce(productId,product._ref),variantId,movementType,quantityChange}`,{ids}),
    client.fetch<Return[]>(`*[_type=="returnTransaction" && !(_id in path("drafts.**"))]{_id,status,restock,items[]{"productId":coalesce(productId,product._ref),variantId,quantity}}`),
    client.fetch<Array<{_id:string}>>(`*[_id in $ids]{_id}`,{ids:candidates.map(movementId)}),
  ]);
  const ps = new Map(products.map(p=>[p._id,p]));
  const ivs = new Map<string,Inventory[]>();
  for (const inv of inventories) ivs.set(inv.productId||"",[...(ivs.get(inv.productId||"")||[]),inv]);
  const orderCounts = new Map<string,number>();
  for (const o of paidOrders) {
    if ((o.salesChannel || "ONLINE").toUpperCase()==="POS") continue;
    for (const line of o.lineItems || []) {
      const k=key(line.productId||"",line.variantId||"");
      if (!candidates.some(c=>key(c.productId,c.variantId)===k)) continue;
      orderCounts.set(k,(orderCounts.get(k)||0)+quantity(line.quantity,"paid order line"));
    }
  }
  const alreadyAdjusted = new Set(existingAdjustments.map(x=>x._id));
  const approved=approvals(approvedFile);
  const reviews:Review[]=[]; const changes:Change[]=[]; const blocked:string[]=[]; let alreadyCorrect=0;
  const known = new Set(candidates.map(c=>key(c.productId,c.variantId)));
  for (const k of approved.keys()) if (!known.has(k)) blocked.push(`Unknown approval row: ${k}`);
  for (const c of candidates) {
    const k=key(c.productId,c.variantId);
    const p=ps.get(c.productId); const invList=ivs.get(c.productId)||[];
    if (!p || invList.length!==1) { blocked.push(`${c.name} / ${c.variantName}: missing product or unique inventory record`); continue; }
    const inv=invList[0]; const balances=inv.locationBalances||[];
    const v=(p.variants||[]).find(x=>x._key===c.variantId);
    if (!v) { blocked.push(`${c.name} / ${c.variantName}: variant missing`); continue; }
    const current=quantity(v.stockQuantity,`${c.name} company variant`);
    const allocated=balances.reduce((s,b)=>s+(b.variants||[]).filter(x=>x.variantId===c.variantId).reduce((n,x)=>n+quantity(x.onHand,`${c.name} ledger`),0),0);
    if (allocated===current) { alreadyCorrect++; continue; }
    if (current!==c.company || allocated!==c.allocated || allocated-current!==c.onlineUnits) {
      blocked.push(`${c.name} / ${c.variantName}: live quantities differ from audited snapshot (company ${current}, allocated ${allocated}); rerun DBK-22 and review before adjusting`); continue;
    }
    if (quantity(inv.reserved,`${c.name} reserved`) >0) { blocked.push(`${c.name}: reserved stock exists`); continue; }
    if (orderCounts.get(k)!==c.onlineUnits) { blocked.push(`${c.name} / ${c.variantName}: online sales ${orderCounts.get(k)||0} no longer equal audited ${c.onlineUnits}`); continue; }
    if (movements.some(m=>key(m.productId||"",m.variantId||"")===k && String(m.movementType).toUpperCase()!=="SALE")) {
      blocked.push(`${c.name} / ${c.variantName}: non-sale inventory movement exists; investigate separately`); continue;
    }
    if (returns.some(r=>(r.items||[]).some(x=>key(x.productId||"",x.variantId||"")===k && quantity(x.quantity,"return quantity")>0))) {
      blocked.push(`${c.name} / ${c.variantName}: return history exists; investigate separately`); continue;
    }
    if (balances.filter(b=>refId(b)===storeId).length!==1) { blocked.push(`${c.name}: expected exactly one Main balance`); continue; }
    if (balances.some(b=>refId(b)!==storeId && (b.variants||[]).some(x=>x.variantId===c.variantId && quantity(x.onHand,"branch quantity")!==0))) {
      blocked.push(`${c.name} / ${c.variantName}: some units are in another store; cannot attribute the ecommerce difference safely`); continue;
    }
    const b=balances.find(b=>refId(b)===storeId)!;
    const vb=(b.variants||[]).filter(x=>x.variantId===c.variantId);
    if (vb.length!==1 || quantity(vb[0].onHand,"main variant")<c.onlineUnits) { blocked.push(`${c.name}: invalid Main variant balance`); continue; }
    const sumVariant=(b.variants||[]).reduce((n,x)=>n+quantity(x.onHand,"Main variant quantity"),0);
    if (sumVariant!==quantity(b.onHand,"Main total")) { blocked.push(`${c.name}: Main summary balance already differs from variant sum`); continue; }
    if (alreadyAdjusted.has(movementId(c))) { blocked.push(`${c.name}: already has a DBK-23A adjustment movement but still has a stock discrepancy`); continue; }
    const expected:Review = { productId:c.productId,name:c.name,variantId:c.variantId,variantName:c.variantName,company:current,ledgerBefore:allocated,adjustment:-c.onlineUnits,onlinePaidUnits:c.onlineUnits,productRev:p._rev,inventoryRev:inv._rev,mainStoreId:storeId,approval:"",reason:"" };
    const match=approved.get(k);
    if (match && match.approval === "APPROVE") {
      if (!match.reason.trim() || ["company","ledgerBefore","adjustment","onlinePaidUnits"].some(f=>String(match[f as keyof Review])!==String(expected[f as keyof Review])) ||
        match.productRev!==p._rev || match.inventoryRev!==inv._rev || match.mainStoreId!==storeId) {
        blocked.push(`${c.name} / ${c.variantName}: approval is stale or incomplete`);
      } else { expected.approval="APPROVE"; expected.reason=match.reason; }
    }
    reviews.push(expected);
    const updatedBalances=balances.map(balance=>refId(balance)===storeId ? {
      ...balance,
      onHand: quantity(balance.onHand,"Main onHand")-c.onlineUnits,
      variants:(balance.variants||[]).map(x=>x.variantId===c.variantId ? {...x,onHand:quantity(x.onHand,"variant onHand")-c.onlineUnits}:x),
    }:balance);
    changes.push({item:c,product:p,inventory:inv,updatedBalances,review:expected});
  }
  // Multiple targeted variants of a single product must be updated together,
  // not each from the original inventory revision.
  const groups=new Map<string,Change[]>();
  for (const change of changes) groups.set(change.item.productId,[...(groups.get(change.item.productId)||[]),change]);
  for (const [pid,group] of groups) {
    if (group.length<=1) continue;
    let next=group[0].inventory.locationBalances||[];
    for (const change of group) next=next.map(balance=>refId(balance)===storeId ? {
      ...balance,
      onHand: quantity(balance.onHand,"Main onHand")-change.item.onlineUnits,
      variants:(balance.variants||[]).map(x=>x.variantId===change.item.variantId ? {...x,onHand:quantity(x.onHand,"variant onHand")-change.item.onlineUnits}:x),
    }:balance);
    group[0].updatedBalances=next;
  }
  const headers=["productId","name","variantId","variantName","company","ledgerBefore","adjustment","onlinePaidUnits","productRev","inventoryRev","mainStoreId","approval","reason"];
  writeFileSync(outFile,[headers,...reviews.map(r=>headers.map(h=>r[h as keyof Review]))].map(row=>row.map(csv).join(",")).join("\n")+"\n","utf8");
  const pending=reviews.filter(r=>r.approval!=="APPROVE").length;
  console.log(`DBK-23A ${write?"WRITE":"DRY RUN"}: Main ${store.name}; eligible ${reviews.length}; already reconciled ${alreadyCorrect}; approved ${reviews.length-pending}; pending ${pending}; blockers ${blocked.length}`);
  console.log(`Review: ${outFile}. This operation changes ONLY 15 audited location-ledger variants; no parent/product stock changes, no consolidation.`);
  for (const r of reviews) console.log(`  ${r.name} / ${r.variantName}: location ${r.ledgerBefore} -> ${r.company} (historical online units ${r.onlinePaidUnits})`);
  for (const msg of blocked) console.error(`BLOCKED: ${msg}`);
  if (blocked.length) throw new Error("Preflight found changed/unverifiable stock. NO WRITES were made.");
  if (!write) return console.log("DRY RUN: NO WRITES. Review/approve CSV and create a production backup before executing.");
  if (pending) throw new Error(`WRITE blocked: ${pending} rows still require explicit approval. NO WRITES made.`);
  if (alreadyCorrect + reviews.length !== candidates.length) throw new Error("Not all 15 targeted records were accounted for; NO WRITES made.");
  let completed=0;
  for (const group of groups.values()) {
    const first=group[0];
    const tx=client.transaction();
    // Check BOTH product and inventory revisions. Writing back the same company
    // value is intentional: it is a compare-and-swap guard, not a stock change.
    tx.patch(first.product._id, patch=>patch.ifRevisionId(first.product._rev).set({initialStock:first.product.initialStock ?? 0}));
    tx.patch(first.inventory._id, patch=>patch.ifRevisionId(first.inventory._rev).set({locationBalances:first.updatedBalances}));
    for (const change of group) {
      const id=movementId(change.item);
      tx.createIfNotExists({
        _id:id,_type:"inventoryMovement",movementNumber:`RECON-${id.slice(-12).toUpperCase()}`,
        movementType:"ADJUSTMENT",product:{_type:"reference",_ref:change.item.productId},productId:change.item.productId,
        productName:change.item.name,variantId:change.item.variantId,variantLabel:change.item.variantName,
        quantityChange:-change.item.onlineUnits,stockBefore:change.item.allocated,stockAfter:change.item.company,
        sourceLocation:store.name,destination:store.name,destinationStore:{_type:"reference",_ref:storeId},
        note:`DBK-23A historical ecommerce sale ledger correction (audited ${change.item.onlineUnits} units). Company and variant stock were already deducted and are not deducted again. Approved reason: ${change.review.reason}`,
        createdAt:new Date().toISOString(),
      });
    }
    try { await tx.commit(); completed+=group.length; }
    catch (err) { console.error(`STOPPED after ${completed} of ${changes.length} adjustments; regenerate fresh approval file and inspect before any retry`,err); throw err; }
  }
  console.log(`DONE: ${completed} location-ledger adjustments, no company stock changed. Run DBK-23 dry run again; parent/variant and incoming conflicts remain for review.`);
}
main().catch(err=>{console.error(err);process.exitCode=1;});
