import test from "node:test";
import assert from "node:assert/strict";
import { allSoldProducts, kenyaCalendarDay, kenyaReportWindow } from "../lib/pos/reporting-core.ts";
import { fullInventoryReportRows } from "../lib/operations/full-inventory-report.ts";

test("all products are retained, including those outside top 20", () => {
  const products = Array.from({length: 37}, (_,i)=>({name:`Product-${i}`,revenue:i}));
  const result=allSoldProducts(products);
  assert.equal(result.length,37);
  assert.equal(result.find((r)=>r.name==="Product-0")?.revenue,0);
});
test("October calendar month starts 00:00 EAT regardless of UTC server clock", () => {
  const now=new Date("2026-10-29T20:45:00.000Z");
  assert.deepEqual(kenyaReportWindow("month",now),{
    start:"2026-09-30T21:00:00.000Z",end:"2026-10-29T20:45:00.000Z"});
  assert.equal(kenyaCalendarDay("2026-10-28T22:30:00Z"),"2026-10-29");
  assert.equal(kenyaReportWindow("day",now).start,"2026-10-29T21:00:00.000Z".replace('2026-10-29','2026-10-28'));
});
test("full inventory lists all products/locations/variants, separates unallocated", () => {
  const product={id:"p1",productId:"p1",sku:"SKU",name:"Product",category:"Test",
    location:"Company",onHand:15,companyOnHand:15,reserved:1,incoming:4,unallocatedOnHand:5,
    reorderPoint:1,unitCost:2,retailPrice:5,locationBalances:[
    {storeId:"store1",storeName:"Main",onHand:10,incoming:3,
      variants:[{variantId:"v1",variantLabel:"Red",onHand:10,incoming:3}]}
  ]};
  const rows=fullInventoryReportRows([product],{includeCompany:true,hideProcurement:false});
  assert.deepEqual(rows.map(r=>r.level),["COMPANY","LOCATION","VARIANT","UNALLOCATED — REVIEW"]);
  assert.equal(rows[3].onHand,5);
  assert.equal(rows[1].onHand,10);
  assert.equal(rows[2].variant,"Red");
});
test("store-scoped inventory does not export company totals/costs", () => {
  const p={id:"p1",productId:"p1",sku:"S",name:"Name",category:"C",location:"Main",onHand:3,
    reserved:0,incoming:0,reorderPoint:1,unitCost:99,retailPrice:100,
    locationBalances:[{storeId:"s",storeName:"Main",onHand:3,incoming:0}]};
  const rows=fullInventoryReportRows([p],{includeCompany:false,hideProcurement:true});
  assert.equal(rows.length,1);
  assert.equal(rows[0].level,"LOCATION");
  assert.equal(rows[0].unitCost,0);
});
