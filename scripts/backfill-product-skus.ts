import { getCliClient } from "sanity/cli";
import { generateProductSku } from "../sanity/lib/sku";

type ProductRow = {
  _id: string;
  name?: string;
  sku?: string;
};

const client = getCliClient().withConfig({ apiVersion: "2025-01-01" });
const dryRun = process.argv.includes("--dry-run");
const BATCH_SIZE = 20;

async function main() {
  const config = client.config();

  console.log("Decor by Kasiwa SKU backfill");
  console.log(`Project: ${config.projectId}`);
  console.log(`Dataset: ${config.dataset}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "WRITE"}`);
  console.log("");

  const products = await client.fetch<ProductRow[]>(
    `*[_type == "product" && !(_id in path("drafts.**"))] | order(_id asc) { _id, name, sku }`,
  );

  const existingSkus = new Map<string, string>();

  for (const product of products) {
    const sku = product.sku?.trim();
    if (!sku) continue;

    const previousOwner = existingSkus.get(sku);
    if (previousOwner && previousOwner !== product._id) {
      throw new Error(`Existing duplicate SKU detected: ${sku} on ${previousOwner} and ${product._id}`);
    }

    existingSkus.set(sku, product._id);
  }

  const missing = products.filter((product) => !product.sku?.trim());
  const skippedWithoutName = missing.filter((product) => !product.name?.trim());
  const candidates = missing.filter((product) => product.name?.trim());

  const generated = candidates.map((product) => ({
    _id: product._id,
    name: product.name!.trim(),
    sku: generateProductSku(product.name!.trim(), product._id),
  }));

  for (const row of generated) {
    const previousOwner = existingSkus.get(row.sku);
    if (previousOwner && previousOwner !== row._id) {
      throw new Error(`Generated SKU collision: ${row.sku} on ${previousOwner} and ${row._id}`);
    }
    existingSkus.set(row.sku, row._id);
  }

  console.log(`Products found: ${products.length}`);
  console.log(`Already have SKU: ${products.length - missing.length}`);
  console.log(`Missing SKU: ${missing.length}`);
  console.log(`Ready to backfill: ${generated.length}`);
  console.log(`Skipped (missing product name): ${skippedWithoutName.length}`);
  console.log("");

  console.log("Sample generated SKUs:");
  for (const row of generated.slice(0, 10)) {
    console.log(`  ${row.name} -> ${row.sku}`);
  }

  if (dryRun) {
    console.log("\nDry run complete. No Sanity documents were changed.");
    return;
  }

  for (let start = 0; start < generated.length; start += BATCH_SIZE) {
    const batch = generated.slice(start, start + BATCH_SIZE);

    await Promise.all(
      batch.map((row) => client.patch(row._id).setIfMissing({ sku: row.sku }).commit()),
    );

    console.log(`Updated ${Math.min(start + batch.length, generated.length)}/${generated.length}`);
  }

  console.log(`\nDone. Backfilled ${generated.length} product SKU(s).`);
  console.log("Existing SKU values were not overwritten.");
}

main().catch((error) => {
  console.error("\nSKU backfill failed:");
  console.error(error);
  process.exitCode = 1;
});
