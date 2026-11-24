import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/backoffice/products/[id]/archive/route.ts", import.meta.url), "utf8");
const view = readFileSync(new URL("../components/backoffice/ProductDetailPage.tsx", import.meta.url), "utf8");

test("only administrators can remove products from sale", () => {
  assert.match(route, /getApiStaff\(\["ADMIN"\]\)/);
});
test("requires the production maintenance gate to be open", () => {
  assert.match(route, /dbk109MaintenanceDecision\(\)/);
  assert.match(route, /maintenance !== "OPEN"/);
});
test("archives sales channels and availability with revision protection", () => {
  assert.match(route, /\.ifRevisionId\(product\._rev\)/);
  assert.match(route, /available: false, ecommerceEnabled: false, posEnabled: false/);
});
test("retains registered stock and catalogue identity", () => {
  assert.doesNotMatch(route, /\.delete\(|DELETE FROM|dbk51_stock_balances|dbk69_inventory_movements/);
});
test("UI calls the archive action rather than the deliberately blocked deletion API", () => {
  assert.match(view, /\/archive`/);
  assert.match(view, /Remove from sale/);
  assert.doesNotMatch(view, /function deleteProduct\(|Delete product/);
});
