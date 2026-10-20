/**
 * One-time company-wide inventory consolidation into one client-created MAIN store.
 *
 * This deliberately differs from assign-existing-stock-to-main.ts: ALL locations
 * (including Branch stock) become zero / removed, and every product is assigned
 * to the selected Main store. Run the dry-run and back up Sanity FIRST.
 *
 * WRITE requires both DBK_ALL_MAIN_WRITE=1 and
 * DBK_ALL_MAIN_CONFIRM=MOVE_ALL_STOCK_TO_MAIN.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getCliClient } from "sanity/cli";

type Variant = { _key?: string; title?: string; colour?: string; size?: string; stockQuantity?: number };
type VariantBalance = { _key?: string; variantId?: string; variantLabel?: string; onHand?: number; incoming?: number };
type Balance = {
  _key?: string; store?: { _type?: string; _ref?: string }; storeId?: string;
  storeName?: string; storeCode?: string; onHand?: number; incoming?: number;
  variants?: VariantBalance[];
};
type Product = { _id: string; _rev: string; name?: string; initialStock?: number; variants?: Variant[] };
type Inventory = {
  _id: string; _rev: string; productId?: string; defaultStore?: { _ref?: string };
  incoming?: number; reserved?: number; incomingUnallocated?: number; unallocatedOnHand?: number;
  stockReconciliationExceptions?: ReconciliationException[];
  incomingByVariant?: Array<{ variantId?: string; quantity?: number }>;
  locationBalances?: Balance[];
  stockConsolidatedToMainAt?: string;
};
type ReconciliationException = {
  _type: "object"; _key: string; issue: "PARENT_VS_VARIANTS" | "INCOMING_VS_VARIANTS";
  before: number; after: number; difference: number; note: string; recordedAt: string;
};
type Store = { _id: string; name: string; code?: string };
type Movement = { sourceId?: string; sourceName: string; variantId?: string; variantLabel?: string; quantity: number };
type Plan = {
  product: Product; inventory?: Inventory; mainBalance: Balance;
  movements: Movement[]; sourceBalanceCount: number;
  sourceOnHand: number; companyOnHand: number;
  isChange: boolean; adjustments: Array<{ variantId?: string; variantLabel?: string; before: number; after: number }>;
  companyIncoming: number; incomingUnallocated: number; unallocatedOnHand: number;
  parentStockCorrected: boolean; incomingCorrected: boolean;
  reconciliationExceptions: ReconciliationException[];
};
type IssueCode = "LEDGER_EXCEEDS_COMPANY" | "VARIANT_LEDGER_EXCEEDS_COMPANY" | "PARENT_VS_VARIANTS" | "INCOMING_VS_VARIANTS";
type Issue = {
  productId: string; productName: string; variantId: string; variantName: string;
  issue: IssueCode; current: number; comparison: number; proposed: number;
  productRevision: string; inventoryRevision: string; mainStoreId: string;
};
type Approval = Pick<Issue, "productId" | "variantId" | "issue" | "productRevision" | "inventoryRevision" | "mainStoreId"> & {
  current: string; comparison: string; proposed: string; approval: string; reason: string;
};
const issueKey = (issue: Pick<Issue, "productId" | "variantId" | "issue">) => [issue.productId, issue.variantId, issue.issue].join("|");

// Quotes and embedded commas/newlines are supported. No dependency is required.
function parseCsv(contents: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i];
    if (c === '"') {
      if (quoted && contents[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(value); value = "";
      if (c === "\n") { rows.push(row); row = []; }
    } else if (c !== "\r" || quoted) value += c;
  }
  if (quoted) throw new Error("Approval CSV has an unclosed quote");
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
function readApprovals(path: string | undefined): Map<string, Approval> {
  const result = new Map<string, Approval>();
  if (!path) return result;
  const rows = parseCsv(readFileSync(path, "utf8"));
  const required = ["productId", "variantId", "issue", "current", "comparison", "proposed", "productRevision", "inventoryRevision", "mainStoreId", "approval", "reason"];
  const header = rows.shift() || [];
  for (const field of required) if (!header.includes(field)) throw new Error(`Approval CSV is missing column: ${field}`);
  for (const [i, values] of rows.entries()) {
    if (!values.some(Boolean)) continue;
    const data = Object.fromEntries(header.map((name, idx) => [name, values[idx] || ""]));
    const approval = data as unknown as Approval;
    const key = issueKey(approval);
    if (!approval.productId || !approval.issue || result.has(key)) throw new Error(`Missing or duplicate approval at CSV row ${i + 2}`);
    result.set(key, approval);
  }
  return result;
}

const client = getCliClient().withConfig({ apiVersion: "2026-08-27", useCdn: false, perspective: "published" });
const write = process.env.DBK_ALL_MAIN_WRITE === "1";
const confirmation = process.env.DBK_ALL_MAIN_CONFIRM;
const storeId = process.env.DBK_MAIN_STORE_ID?.trim();
const ref = (id: string) => ({ _type: "reference" as const, _ref: id });
const balanceId = (b: Balance) => b.store?._ref || b.storeId;
const number = (value: unknown, label: string, errors: string[]): number => {
  const n = value === null || value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    errors.push(`${label} must be a non-negative whole number (received ${JSON.stringify(value)})`);
    return 0;
  }
  return n;
};
const key = (value: string, prefix: string) => `${prefix}-${createHash("sha1").update(value).digest("hex").slice(0, 24)}`;
const variantLabel = (v: Variant) => v.title || [v.colour, v.size].filter(Boolean).join(" / ") || v._key || "Variant";

// Compare only inventory quantities and store identity. Sanity may omit optional
// properties and add reference metadata, so JSON.stringify on fetched vs freshly
// constructed objects is not an idempotent verification check.
function sameStoreBalance(current: Balance | undefined, expected: Balance): boolean {
  if (!current || balanceId(current) !== balanceId(expected)) return false;
  const qty = (n: number | undefined) => Number(n ?? 0);
  if (qty(current.onHand) !== qty(expected.onHand) || qty(current.incoming) !== qty(expected.incoming)) return false;
  const actualVariants = current.variants || [];
  const expectedVariants = expected.variants || [];
  if (actualVariants.length !== expectedVariants.length) return false;
  const actualById = new Map(actualVariants.map(v => [v.variantId, v]));
  if (actualById.size !== actualVariants.length) return false;
  return expectedVariants.every(v => {
    const actual = actualById.get(v.variantId);
    return actual && qty(actual.onHand) === qty(v.onHand) && qty(actual.incoming) === qty(v.incoming);
  });
}

function planProduct(
  product: Product, inventory: Inventory | undefined, store: Store, errors: string[],
  requireApproval: (issue: Issue) => boolean,
): Plan {
  const label = `${product.name || "Unnamed"} (${product._id})`;
  const balances = inventory?.locationBalances || [];
  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const main = balances.find(b => balanceId(b) === store._id);
  const sourceBalanceCount = balances.filter(b => balanceId(b) !== store._id).length;
  const movements: Movement[] = [];
  const adjustments: Plan["adjustments"] = [];
  const sourceOnHand = balances.reduce((sum, b) => sum + number(b.onHand, `${label}: balance onHand`, errors), 0);
  let companyOnHand = number(product.initialStock, `${label}: company initialStock`, errors);
  let companyIncoming = number(inventory?.incoming, `${label}: company incoming`, errors);
  let parentStockCorrected = false, incomingCorrected = false;
  let incomingUnallocated = number(inventory?.incomingUnallocated, `${label}: unallocated incoming`, errors);
  let unallocatedOnHand = number(inventory?.unallocatedOnHand, `${label}: stock with unknown variant`, errors);
  const reconciliationExceptions: ReconciliationException[] = [];
  const at = new Date().toISOString();
  const allocatedIncoming = balances.reduce((sum, b) => sum + number(b.incoming, `${label}: balance incoming`, errors), 0);
  const reserved = number(inventory?.reserved, `${label}: reserved`, errors);

  if (!inventory?.stockConsolidatedToMainAt && reserved > 0) errors.push(`${label}: ${reserved} reserved unit(s); resolve live reservations before moving stock`);
  if (inventory?.stockConsolidatedToMainAt && sourceBalanceCount > 0) {
    errors.push(`${label}: previously consolidated; branches now have balances. Do not rerun this one-time migration after redistribution`);
  }
  if (sourceOnHand > companyOnHand && !hasVariants) {
    const ok = requireApproval({ productId: product._id, productName: product.name || "", variantId: "", variantName: "",
      issue: "LEDGER_EXCEEDS_COMPANY", current: companyOnHand, comparison: sourceOnHand, proposed: companyOnHand,
      productRevision: product._rev, inventoryRevision: inventory?._rev || "", mainStoreId: store._id });
    if (!ok) errors.push(`${label}: ${sourceOnHand} allocated vs ${companyOnHand} company stock; explicit approval required`);
    else adjustments.push({ before: sourceOnHand, after: companyOnHand });
  }
  if (allocatedIncoming > companyIncoming && !hasVariants) {
    errors.push(`${label}: ${allocatedIncoming} allocated incoming vs ${companyIncoming} company incoming`);
  }

  const newVariants: VariantBalance[] = [];
  if (hasVariants) {
    const known = new Set<string>();
    for (const v of variants) {
      if (!v._key || known.has(v._key)) {
        errors.push(`${label}: missing or duplicate variant key ${v._key || "(blank)"}`);
        continue;
      }
      known.add(v._key);
      const total = number(v.stockQuantity, `${label}: variant ${v._key} company stock`, errors);
      const records = balances.map(b => ({ b, v: (b.variants || []).filter(x => x.variantId === v._key) }));
      const allocated = records.reduce((sum, r) => sum + r.v.reduce((n,x) => n + number(x.onHand, `${label}: variant ${v._key} allocated`, errors), 0), 0);
      const companyVariantIncoming = number((inventory?.incomingByVariant || []).find(x => x.variantId === v._key)?.quantity, `${label}: variant ${v._key} incoming`, errors);
      const allocatedVariantIncoming = records.reduce((sum, r) => sum + r.v.reduce((n,x) => n + number(x.incoming, `${label}: variant ${v._key} incoming balance`, errors), 0), 0);
      if (allocated > total) {
        const ok = requireApproval({ productId: product._id, productName: product.name || "", variantId: v._key,
          variantName: variantLabel(v), issue: "VARIANT_LEDGER_EXCEEDS_COMPANY", current: total, comparison: allocated,
          proposed: total, productRevision: product._rev, inventoryRevision: inventory?._rev || "", mainStoreId: store._id });
        if (!ok) errors.push(`${label}: variant ${v._key} has ${allocated} allocated but only ${total} company stock; explicit approval required`);
        else adjustments.push({ variantId: v._key, variantLabel: variantLabel(v), before: allocated, after: total });
      }
      if (allocatedVariantIncoming > companyVariantIncoming) errors.push(`${label}: variant ${v._key} has inconsistent incoming stock`);
      const prevMain = main?.variants?.find(x => x.variantId === v._key);
      newVariants.push({
        _key: prevMain?._key || key(v._key, "variant"),
        variantId: v._key,
        variantLabel: variantLabel(v),
        onHand: total,
        incoming: companyVariantIncoming,
      });
      for (const r of records) {
        if (balanceId(r.b) === store._id) continue;
        const qty = r.v.reduce((sum, x) => sum + number(x.onHand, `${label}: source variant`, errors), 0);
        if (qty > 0) movements.push({ sourceId: balanceId(r.b), sourceName: r.b.storeName || balanceId(r.b) || "Unassigned", variantId: v._key, variantLabel: variantLabel(v), quantity: qty });
      }
    }
    for (const b of balances) {
      const sumV = (b.variants || []).reduce((sum,v) => sum + number(v.onHand, `${label}: individual variant balance`, errors), 0);
      const sumI = (b.variants || []).reduce((sum,v) => sum + number(v.incoming, `${label}: individual variant incoming`, errors), 0);
      const bStock = number(b.onHand, `${label}: store stock`, errors);
      const bIncoming = number(b.incoming, `${label}: store incoming`, errors);
      if (sumV !== bStock || sumI !== bIncoming) {
        errors.push(`${label}: location ${balanceId(b) || "Unassigned"} totals do not match variant breakdown (stock ${bStock} vs ${sumV}; incoming ${bIncoming} vs ${sumI})`);
      }
      for (const v of b.variants || []) {
        if (!known.has(v.variantId || "") && (number(v.onHand, `${label}: orphan stock`, errors) > 0 || number(v.incoming, `${label}: orphan incoming`, errors) > 0)) {
          errors.push(`${label}: unknown stocked variant ${v.variantId} at ${balanceId(b) || "Unassigned"}`);
        }
      }
    }
    // Company quantities not present in any location were legacy/unallocated stock,
    // not additional physical goods to add to the company total.
    for (const v of newVariants) {
      const allocated = balances.reduce((sum, b) => sum + (b.variants || []).filter(x => x.variantId === v.variantId)
        .reduce((n, x) => n + number(x.onHand, `${label}: allocated ${v.variantId}`, errors), 0), 0);
      if ((v.onHand || 0) > allocated) movements.push({
        sourceName: "Previously unallocated company stock", variantId: v.variantId,
        variantLabel: v.variantLabel, quantity: (v.onHand || 0) - allocated,
      });
    }
    const companyVariantStock = newVariants.reduce((sum,v) => sum + (v.onHand || 0), 0);
    const companyVariantIncomingTotal = newVariants.reduce((sum,v) => sum + (v.incoming || 0), 0);
    if (companyVariantStock !== companyOnHand) {
      const ok = requireApproval({ productId: product._id, productName: product.name || "", variantId: "", variantName: "",
        issue: "PARENT_VS_VARIANTS", current: companyOnHand, comparison: companyVariantStock, proposed: companyVariantStock,
        productRevision: product._rev, inventoryRevision: inventory?._rev || "", mainStoreId: store._id });
      if (!ok) errors.push(`${label}: initialStock ${companyOnHand} differs from variant total ${companyVariantStock}; confirm variant totals before changing product total`);
      else {
        reconciliationExceptions.push({
          _type: "object", _key: key(`${product._id}|PARENT_VS_VARIANTS|${product._rev}`, "review"),
          issue: "PARENT_VS_VARIANTS", before: companyOnHand, after: companyVariantStock,
          difference: companyOnHand - companyVariantStock,
          note: "DBK-25 records-only policy: sellable stock uses the actual variant balances. The original parent quantity remains here as an unresolved accounting difference, NOT proof of physical stock loss or a sale. No units were assigned arbitrarily to a colour/size.",
          recordedAt: at,
        });
        // Retain any unverified positive difference in a distinct, unsellable
        // evidence field instead of pretending it was sold or discarding the
        // originally recorded parent quantity. An increase in variants above
        // the parent is separately recorded in the exception history.
        if (companyOnHand > companyVariantStock) {
          unallocatedOnHand += companyOnHand - companyVariantStock;
        }
        companyOnHand = companyVariantStock; parentStockCorrected = true;
      }
    }
    if (companyVariantIncomingTotal !== companyIncoming) {
      const gap = companyIncoming - companyVariantIncomingTotal;
      if (gap >= 0 && incomingUnallocated === gap && gap > 0) {
        // Previously reviewed unassigned incoming remains visible in the parent
        // record; it is not treated as received or assigned to a variant.
      } else {
        const ok = requireApproval({ productId: product._id, productName: product.name || "", variantId: "", variantName: "",
          issue: "INCOMING_VS_VARIANTS", current: companyIncoming, comparison: companyVariantIncomingTotal, proposed: companyVariantIncomingTotal,
          productRevision: product._rev, inventoryRevision: inventory?._rev || "", mainStoreId: store._id });
        if (!ok) errors.push(`${label}: company incoming ${companyIncoming} differs from variant incoming ${companyVariantIncomingTotal}; explicit approval of unassigned incoming required`);
        else if (gap < 0) errors.push(`${label}: more incoming units assigned to variants than the company total; cannot infer the delivery`);
        else {
          incomingUnallocated = gap;
          incomingCorrected = true;
          reconciliationExceptions.push({
            _type: "object", _key: key(`${product._id}|INCOMING_VS_VARIANTS|${inventory?._rev || ""}`, "review"),
            issue: "INCOMING_VS_VARIANTS", before: companyIncoming, after: companyVariantIncomingTotal,
            difference: gap,
            note: "DBK-25 records-only policy: outstanding incoming units retained in company incoming and incomingUnallocated; NOT received, discarded or allocated to an arbitrary variant. The Main store's variant incoming balances exclude these unassigned units.",
            recordedAt: at,
          });
        }
      }
    }
  } else {
    if (companyOnHand > sourceOnHand) movements.push({ sourceName: "Previously unallocated company stock", quantity: companyOnHand - sourceOnHand });
    for (const b of balances) {
      if ((b.variants || []).some(v => number(v.onHand, `${label}: stray variant`, errors) > 0 || number(v.incoming, `${label}: stray incoming`, errors) > 0)) {
        errors.push(`${label}: found variant stock in ledger, but product has no variants`);
      }
      if (balanceId(b) === store._id) continue;
      const qty = number(b.onHand, `${label}: source stock`, errors);
      if (qty > 0) movements.push({ sourceId: balanceId(b), sourceName: b.storeName || balanceId(b) || "Unassigned", quantity: qty });
    }
  }

  const newMain: Balance = {
    _key: main?._key || key(store._id, "store"),
    store: ref(store._id),
    storeId: store._id,
    storeName: store.name,
    storeCode: store.code,
    onHand: hasVariants ? newVariants.reduce((sum,v) => sum + (v.onHand || 0), 0) : companyOnHand,
    incoming: hasVariants ? newVariants.reduce((sum,v) => sum + (v.incoming || 0), 0) : companyIncoming,
    ...(hasVariants ? { variants: newVariants } : {}),
  };
  const isChange = !inventory?.stockConsolidatedToMainAt ||
    inventory?.defaultStore?._ref !== store._id || balances.length !== 1 ||
    !sameStoreBalance(main, newMain);
  if (inventory?.stockConsolidatedToMainAt && isChange) {
    errors.push(`${label}: already consolidated previously, but balances differ now. Refusing to run again and overwrite post-migration changes`);
  }
  return { product, inventory, mainBalance: newMain, movements, adjustments, sourceBalanceCount, sourceOnHand,
    companyOnHand, companyIncoming, incomingUnallocated, unallocatedOnHand,
    parentStockCorrected, incomingCorrected, reconciliationExceptions, isChange };
}

async function main() {
  if (write && confirmation !== "MOVE_ALL_STOCK_TO_MAIN") {
    throw new Error("WRITE blocked. Export a Sanity backup, stop POS/checkout, review dry run, then set DBK_ALL_MAIN_CONFIRM=MOVE_ALL_STOCK_TO_MAIN.");
  }
  const stores = await client.fetch<Store[]>(`*[_type == "storeLocation" && locationType == "MAIN" && active != false]{_id,name,code}`);
  if (!storeId) throw new Error(`Set DBK_MAIN_STORE_ID to the actual Sanity document ID of the target Main store. Available: ${stores.map(s => `${s.name} (${s._id})`).join(", ")}`);
  const store = stores.find(s => s._id === storeId);
  if (!store) throw new Error(`Store ${storeId} is not an active MAIN. Available MAIN stores: ${stores.map(s => `${s.name} (${s._id})`).join(", ")}`);
  const approvals = readApprovals(process.env.DBK_MAIN_APPROVALS_PATH);
  const issues: Issue[] = [];
  const usedApprovals = new Set<string>();
  const errors: string[] = [];
  const requireApproval = (issue: Issue): boolean => {
    issues.push(issue);
    const match = approvals.get(issueKey(issue));
    if (!match) return false;
    usedApprovals.add(issueKey(issue));
    const stable = match.productId === issue.productId && match.variantId === issue.variantId &&
      match.issue === issue.issue && match.productRevision === issue.productRevision &&
      match.inventoryRevision === issue.inventoryRevision && match.mainStoreId === issue.mainStoreId &&
      match.current === String(issue.current) && match.comparison === String(issue.comparison) &&
      match.proposed === String(issue.proposed);
    if (!stable) { errors.push(`${issue.productName} (${issue.productId}) ${issue.issue}: approval is STALE; regenerate and review current figures`); return false; }
    if (match.approval !== "APPROVE" || !match.reason.trim()) return false;
    return true;
  };
  const products = await client.fetch<Product[]>(`*[_type == "product" && !(_id in path("drafts.**"))]{_id,_rev,name,initialStock,variants[]{_key,title,colour,size,stockQuantity}}`);
  const inventories = await client.fetch<Inventory[]>(`*[_type == "inventoryRecord" && !(_id in path("drafts.**"))]{_id,_rev,"productId":product._ref,defaultStore,incoming,reserved,incomingByVariant,incomingUnallocated,unallocatedOnHand,stockReconciliationExceptions,stockConsolidatedToMainAt,locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}}`);
  const byId = new Map<string, Inventory[]>();
  for (const inv of inventories) byId.set(inv.productId || "", [...(byId.get(inv.productId || "") || []), inv]);
  const plans: Plan[] = [];
  for (const product of products) {
    const matches = byId.get(product._id) || [];
    if (matches.length > 1) { errors.push(`${product._id}: duplicate inventory records; resolve before migration`); continue; }
    plans.push(planProduct(product, matches[0], store, errors, requireApproval));
  }
  const productIds = new Set(products.map(p => p._id));
  for (const inv of inventories) if (!inv.productId || !productIds.has(inv.productId)) errors.push(`Inventory ${inv._id} has no published product. Inspect orphan records before the migration.`);
  for (const key of approvals.keys()) if (!usedApprovals.has(key)) errors.push(`Approval ${key} no longer matches a current issue. Regenerate the approval file.`);
  // Never auto-approve a mismatch. A fresh comparison and a human reason are mandatory.
  const approved = issues.filter(i => {
    const match = approvals.get(issueKey(i));
    return match?.approval === "APPROVE" && Boolean(match.reason.trim()) &&
      match.current === String(i.current) && match.comparison === String(i.comparison) && match.proposed === String(i.proposed) &&
      match.productRevision === i.productRevision && match.inventoryRevision === i.inventoryRevision && match.mainStoreId === i.mainStoreId;
  }).length;
  const changed = plans.filter(p => p.isChange);
  const movements = changed.reduce((sum,p) => sum + p.movements.length, 0);
  const adjustments = changed.reduce((sum,p) => sum + p.adjustments.length, 0);
  // Fresh revisions and exact quantities are part of each approval. Never reuse old approvals.
  const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const approvalPath = process.env.DBK_MAIN_APPROVAL_TEMPLATE_PATH || "DBK-23-main-stock-approval-template.csv";
  const approvalHeaders = ["productId", "productName", "variantId", "variantName", "issue", "current", "comparison", "proposed", "productRevision", "inventoryRevision", "mainStoreId", "approval", "reason"];
  writeFileSync(approvalPath, [approvalHeaders, ...issues.map(issue => [issue.productId, issue.productName, issue.variantId, issue.variantName,
    issue.issue, issue.current, issue.comparison, issue.proposed, issue.productRevision, issue.inventoryRevision, issue.mainStoreId,
    approvals.get(issueKey(issue))?.approval || "", approvals.get(issueKey(issue))?.reason || ""])]
    .map(row => row.map(csv).join(",")).join("\n") + "\n", "utf8");
  const lines: string[][] = [["productId", "productName", "variantId", "variantName", "companyOnHand", "allocatedAcrossLocations", "mainAfter", "incomingAtMainAfter", "oldLocationBalances", "action"]];
  for (const p of plans) {
    const original = p.inventory?.locationBalances || [];
    if (p.product.variants?.length) {
      for (const v of p.product.variants) {
        const prev = original.reduce((sum,b) => sum + (b.variants || []).filter(x => x.variantId === v._key)
          .reduce((n,x) => n + Number(x.onHand || 0), 0), 0);
        const dest = p.mainBalance.variants?.find(x => x.variantId === v._key);
        lines.push([p.product._id, p.product.name || "", v._key || "", variantLabel(v), String(v.stockQuantity ?? 0), String(prev), String(dest?.onHand ?? 0), String(dest?.incoming ?? 0), String(p.sourceBalanceCount), p.isChange ? "CONSOLIDATE" : "NO CHANGE"]);
      }
    } else {
      lines.push([p.product._id, p.product.name || "", "", "", String(p.companyOnHand), String(p.sourceOnHand), String(p.mainBalance.onHand || 0), String(p.mainBalance.incoming || 0), String(p.sourceBalanceCount), p.isChange ? "CONSOLIDATE" : "NO CHANGE"]);
    }
  }
  const planPath = process.env.DBK_MAIN_PLAN_PATH || "DBK-main-stock-consolidation-plan.csv";
  writeFileSync(planPath, lines.map(row => row.map(csv).join(",")).join("\n") + "\n", "utf8");
  console.log(`Full product + variant plan: ${planPath}`);
  console.log(`MODE: ${write ? "WRITE" : "DRY RUN"}; target: ${store.name} (${store._id})`);
  console.log(`Products: ${products.length}; proposed changes: ${changed.length}; transfer movements: ${movements}; proposed ledger corrections: ${adjustments}; parent-total corrections: ${plans.filter(p => p.parentStockCorrected).length}; incoming-total corrections: ${plans.filter(p => p.incomingCorrected).length}; approvals: ${approved}/${issues.length}; blockers: ${errors.length}`);
  console.log(`Approval template: ${approvalPath}. Verify physical counts, transaction history, and exact variant quantities before approving.`);
  for (const p of changed.slice(0, 30)) {
    console.log(`  ${p.product.name || p.product._id} [${p.product._id}] => ${p.mainBalance.onHand} on hand, ${p.mainBalance.incoming} incoming; ${p.sourceBalanceCount} other location balance(s)`);
  }
  if (changed.length > 30) console.log(`  ... ${changed.length - 30} further products not shown. Review the full inventory in Sanity before executing.`);
  if (errors.length) {
    errors.slice(0, 100).forEach(message => console.error(`BLOCKED: ${message}`));
    if (errors.length > 100) console.error(`... ${errors.length - 100} additional blockers`);
    throw new Error("Migration preflight failed. NO WRITES were made. Reconcile discrepancies and retry.");
  }
  if (!write) return console.log("DRY RUN COMPLETE: no data changed. Shut down checkout and export backup before WRITE.");

  const now = new Date().toISOString();
  let completed = 0;
  for (const p of changed) {
    // Product CAS ensures no sale changed company stock since the planning snapshot.
    // Inventory CAS ensures no location balance changed since the planning snapshot.
    const tx = client.transaction();
    tx.patch(p.product._id, patch => patch.ifRevisionId(p.product._rev).set({ initialStock: p.companyOnHand }));
    if (!p.inventory) {
      tx.create({
        _id: `inventory.${p.product._id.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
        _type: "inventoryRecord",
        product: ref(p.product._id), location: store.name, defaultStore: ref(store._id),
        locationBalances: [p.mainBalance], reserved: 0, incoming: p.mainBalance.incoming || 0, reorderPoint: 5,
        stockConsolidatedToMainAt: now,
        ...(p.parentStockCorrected && p.unallocatedOnHand > 0 ? { unallocatedOnHand: p.unallocatedOnHand } : {}),
        ...(p.incomingCorrected ? { incomingUnallocated: p.incomingUnallocated } : {}),
        ...(p.reconciliationExceptions.length ? { stockReconciliationExceptions: p.reconciliationExceptions } : {}),
      });
    } else {
      tx.patch(p.inventory._id, patch => patch.ifRevisionId(p.inventory!._rev).set({
        defaultStore: ref(store._id), location: store.name, locationBalances: [p.mainBalance],
        stockConsolidatedToMainAt: now,
        ...(p.parentStockCorrected && p.unallocatedOnHand > 0 ? { unallocatedOnHand: p.unallocatedOnHand } : {}),
        ...(p.incomingCorrected ? { incomingUnallocated: p.incomingUnallocated } : {}),
        ...(p.reconciliationExceptions.length ? {
          stockReconciliationExceptions: [
            ...(p.inventory?.stockReconciliationExceptions || []), ...p.reconciliationExceptions,
          ],
        } : {}),
      }));
    }
    // Approved overallocated stock was already deducted from company totals. Record
    // the historical store-ledger correction, WITHOUT subtracting sales again.
    for (const adjustment of p.adjustments) {
      const id = `inventoryMovement.${key([p.product._id, store._id, adjustment.variantId || "", "DBK-23", "ledger"].join("|"), "adjust")}`;
      tx.createIfNotExists({
        _id: id, _type: "inventoryMovement", movementNumber: `RECON-${id.slice(-13).toUpperCase()}`,
        movementType: "ADJUSTMENT", product: ref(p.product._id), productId: p.product._id,
        productName: p.product.name || p.product._id,
        ...(adjustment.variantId ? { variantId: adjustment.variantId, variantLabel: adjustment.variantLabel } : {}),
        quantityChange: adjustment.after - adjustment.before,
        stockBefore: adjustment.before, stockAfter: adjustment.after,
        sourceLocation: "Legacy location ledgers", destination: store.name, destinationStore: ref(store._id),
        note: "DBK-23 approved correction of historical location balance to already-updated company stock. No additional sale was deducted. See approved CSV and DBK-22 audit.",
        createdAt: now,
      });
    }
    // One entry per moved branch/variant, with stable keys for audit and replay safety.
    for (const movement of p.movements) {
      const id = `inventoryMovement.${key([p.product._id, store._id, movement.sourceId || "Unassigned", movement.variantId || ""].join("|"), "main")}`;
      tx.createIfNotExists({
        _id: id, _type: "inventoryMovement", movementNumber: `MAIN-${id.slice(-14).toUpperCase()}`,
        movementType: "TRANSFER",
        product: ref(p.product._id), productId: p.product._id, productName: p.product.name || p.product._id,
        ...(movement.variantId ? { variantId: movement.variantId, variantLabel: movement.variantLabel } : {}),
        quantityChange: movement.quantity, sourceLocation: movement.sourceName, destination: store.name,
        ...(movement.sourceId ? { sourceStore: ref(movement.sourceId) } : {}),
        destinationStore: ref(store._id),
        note: "One-time stock consolidation to Main. Previous store quantities are included in the destination balance; no company stock was created.",
        createdAt: now,
      });
    }
    try {
      await tx.commit();
      completed++;
      if (completed % 50 === 0) console.log(`Migrated ${completed}/${changed.length} products`);
    } catch (err) {
      console.error(`STOPPED after ${completed}/${changed.length} products. Failed on ${p.product._id}. Some product transactions may already be committed. Re-run a dry run before any retry.`, err);
      throw err;
    }
  }
  console.log(`DONE: ${completed} products consolidated to ${store.name}. All written inventory records now have ONLY the Main balance. Unset DBK_MAIN_APPROVALS_PATH and run dry run again to verify.`);
}
main().catch(err => { console.error(err); process.exitCode = 1; });
