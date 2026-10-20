/**
 * DBK-25: prepare a revision-bound DBK-23 approval CSV from the CURRENT DRY RUN.
 * This is a local CSV tool only. It never connects to Sanity or writes inventory.
 * No historical orders are deducted twice: uses current sellable variant stock.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = resolve(process.env.DBK_25_TEMPLATE || "DBK-23-main-stock-approval-template.csv");
const output = resolve(process.env.DBK_25_APPROVALS || "DBK-25-records-only-approved.csv");
const reviewPath = resolve(process.env.DBK_25_REVIEW || "DBK-25-records-only-review.csv");
const expectedMain = "storeLocation.4fcbd28b74494e7da7176525e63d73f4";
const expected = new Map([
  ["dbk-product-0024-florist-ribbons", "PARENT_VS_VARIANTS"],
  ["dbk-product-0045-6-pcs-silver-top-bathroom-set", "PARENT_VS_VARIANTS"],
  ["dbk-product-0047-led-butterfly", "LEDGER_EXCEEDS_COMPANY"],
  ["dbk-product-0055-artificial-flower-bunches", "PARENT_VS_VARIANTS"],
  ["dbk-product-0094-ficus-small-tree", "PARENT_VS_VARIANTS"],
  ["dbk-product-0098-6-pcs-plain-stripes-bathroom-set", "PARENT_VS_VARIANTS"],
  ["dbk-product-0108-double-leaf-seramic-vase", "PARENT_VS_VARIANTS"],
  ["dbk-product-0155-big-round-mirrors", "PARENT_VS_VARIANTS"],
  ["dbk-product-0171-6pcs-classy-bathroom-set", "PARENT_VS_VARIANTS"],
  ["dbk-product-0183-3-5-cm-rose-petals|1a99d9b6-855", "VARIANT_LEDGER_EXCEEDS_COMPANY"],
  ["dbk-product-0183-3-5-cm-rose-petals|25fe3074-f06", "VARIANT_LEDGER_EXCEEDS_COMPANY"],
  ["dbk-product-0183-3-5-cm-rose-petals|73ba6893-826", "VARIANT_LEDGER_EXCEEDS_COMPANY"],
  ["dbk-product-0193-wavy-small-mirrors", "PARENT_VS_VARIANTS"],
  ["dbk-product-0221-aroma-diffuser", "PARENT_VS_VARIANTS"],
  ["dbk-product-0222-h2o-humidifier", "INCOMING_VS_VARIANTS"],
  ["dbk-product-0233-jacquard-pillow-cases", "PARENT_VS_VARIANTS"],
  ["dbk-product-import-green-balcony-fence", "PARENT_VS_VARIANTS"],
  ["product.881032f7846f4f3eb13fc56ba58e0a15", "PARENT_VS_VARIANTS"],
]);
const fields = ["productId", "productName", "variantId", "variantName", "issue", "current", "comparison", "proposed", "productRevision", "inventoryRevision", "mainStoreId", "approval", "reason"];
function csvParse(s) {
  const result = []; let row = [], val = "", quoted = false;
  for (let i=0; i<s.length; i++) {
    const c=s[i];
    if (c==='"') { if (quoted && s[i+1]==='"') {val+='"'; i++;} else quoted=!quoted; }
    else if (!quoted && (c===',' || c==='\n')) { row.push(val); val=""; if(c==='\n') { result.push(row); row=[]; } }
    else if (c!=='\r' || quoted) val+=c;
  }
  if(quoted) throw new Error("Unclosed CSV quote");
  if(row.length || val) {row.push(val); result.push(row);}
  return result;
}
const csv = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
const rows = csvParse(readFileSync(input, "utf8"));
const header = rows.shift() || [];
if (fields.some(f=>!header.includes(f))) throw new Error("Approval template columns mismatch. Run the DBK-23 dry run again.");
const data = rows.filter(r=>r.some(x=>x!=='')).map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]||""])));
const seen = new Set();
if (data.length !== expected.size) throw new Error(`Expected exactly ${expected.size} blockers from the latest DBK-23 dry run, got ${data.length}. STOP: do not approve stale/missing/new issues.`);
const review = [["productId", "productName", "variantName", "issue", "current", "comparison", "difference", "decision", "limitation"]];
const seed = new Map(readFileSync("sanity/seed/dbk-products.ndjson", "utf8").split("\n").filter(Boolean).map(x => {const p=JSON.parse(x); return [p._id,p.initialStock ?? ""];}));
let parent=0, ledger=0, incoming=0;
for (const d of data) {
  const k = d.productId + (d.variantId ? `|${d.variantId}` : "");
  if (seen.has(k) || expected.get(k)!==d.issue) throw new Error(`Unexpected/duplicate issue ${k} ${d.issue}; no approvals generated.`);
  seen.add(k);
  if (d.mainStoreId!==expectedMain || !d.productRevision || (!d.inventoryRevision)) throw new Error(`Invalid store or revision ${k}`);
  for (const f of ["current", "comparison", "proposed"]) if (!/^\d+$/.test(d[f]) || !Number.isSafeInteger(Number(d[f]))) throw new Error(`Invalid ${f} for ${k}`);
  const now=Number(d.current), comparison=Number(d.comparison), proposed=Number(d.proposed);
  if (now===comparison || proposed!==(d.issue==="LEDGER_EXCEEDS_COMPANY" || d.issue==="VARIANT_LEDGER_EXCEEDS_COMPANY" ? now : comparison)) throw new Error(`Unexpected proposed correction ${k}`);
  if (d.issue==="PARENT_VS_VARIANTS") {
    parent++;
    d.reason=`DBK-25 records-only decision: existing per-variant balances (${comparison}) determine sellable units; parent summary (${now}) is inconsistent. Preserve positive surplus (${Math.max(0,now-comparison)}) in unallocatedOnHand and both original figures in Sanity reconciliation evidence. No opening-stock sales deducted twice; physical variant counts remain unverified.`;
    review.push([d.productId,d.productName,d.variantName,d.issue,now,comparison,now-comparison,`${now} parent -> ${comparison} variant-backed units`,`Physical variant counts unverified; positive parent surplus tracked separately as unallocatedOnHand, not lost or marked sold. Seed opening: ${seed.get(d.productId) ?? "unknown"}`]);
  } else if (d.issue==="INCOMING_VS_VARIANTS") {
    incoming++;
    if (now<comparison) throw new Error(`Cannot handle negative/unexplained incoming for ${k}`);
    d.reason=`DBK-25 records-only decision: preserve ${now} company incoming, keep ${now-comparison} units UNASSIGNED to any variant or location; do not mark received or sellable. Preserve the pending-stock discrepancy evidence.`;
    review.push([d.productId,d.productName,d.variantName,d.issue,now,comparison,now-comparison,"Retain company incoming; flag unassigned incoming","Delivery and variant not verified; no stock receipt recorded."]);
  } else {
    ledger++;
    if (comparison<now) throw new Error(`Unexpected shortage in ledger for ${k}`);
    d.reason=`DBK-25 records-only decision: ${comparison-now} extra location-ledger units cannot be proven available. Align location ledger to current already-deducted company/variant quantity ${now}, preserve an adjustment movement. No second sale deduction.`;
    review.push([d.productId,d.productName,d.variantName,d.issue,now,comparison,comparison-now,"Reduce overstated ledger to current company units","May reflect other adjustments, not exactly equal to historical online order quantities."]);
  }
  d.approval="APPROVE";
}
if (parent!==13 || ledger!==4 || incoming!==1) throw new Error(`Wrong issue distribution: ${parent} parent, ${ledger} ledger, ${incoming} incoming`);
if (process.env.DBK_RECORDS_ONLY_POLICY!=="I_ACCEPT_UNVERIFIED_VARIANTS") {
  console.log(`REVIEW ONLY: ${parent} parent/variant, ${ledger} ledger, ${incoming} incoming discrepancies. Set DBK_RECORDS_ONLY_POLICY=I_ACCEPT_UNVERIFIED_VARIANTS to generate approval CSV. No stock or other files changed.`);
  process.exit(0);
}
writeFileSync(output,[header,...data.map(d=>header.map(h=>d[h]||""))].map(r=>r.map(csv).join(",")).join("\n")+"\n","utf8");
writeFileSync(reviewPath,review.map(r=>r.map(csv).join(",")).join("\n")+"\n","utf8");
console.log(`Prepared ${data.length} REVISION-BOUND approvals: ${parent} parent, ${ledger} ledger, ${incoming} incoming.`);
console.log(`Approval CSV: ${output}`);
console.log(`Evidence and assumptions: ${reviewPath}`);
console.log("READ-ONLY. NO SANITY WRITES. Company parent differences will be retained as evidence, NOT physically verified stock. Confirm DBK-23 dry run against these approvals, back up, and pause all sales before execution.");
