import fs from "node:fs";
import path from "node:path";
import { getCliClient } from "sanity/cli";
import { generateProductSku } from "../sanity/lib/sku";

type ManifestRow = {
  sourceRow: number;
  documentId: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  initialStock: number | null;
  available: boolean;
  primaryCategoryRef: string;
  spaceRefs: string[];
  sourceStatus: "existing-seed" | "new";
  blockedReason: string | null;
  categoryReviewRequired: boolean;
  categoryNote: string;
  driveImageUrl: string | null;
  driveImageMappedBy: string | null;
};

type ExistingProduct = {
  _id: string;
  name?: string;
  slug?: string;
  sku?: string;
  price?: number;
  initialStock?: number | null;
  primaryCategoryRef?: string;
  heroAssetRef?: string;
};

type ReportRow = {
  name: string;
  sourceRow: number;
  action:
    | "CREATE"
    | "PATCH"
    | "NO_CHANGE"
    | "BLOCKED"
    | "FAILED";
  documentId?: string;
  matchedBy?: string;
  imageAction?: "UPLOAD" | "PRESERVE" | "SKIP" | "FAILED";
  note?: string;
};

const client = getCliClient().withConfig({ apiVersion: "2026-08-01" });

const WRITE = process.env.DBK_MIGRATION_WRITE === "1";
const MIGRATE_IMAGES = process.env.DBK_MIGRATE_IMAGES === "1";
const OVERWRITE_IMAGES = process.env.DBK_OVERWRITE_IMAGES === "1";

const manifestPath = path.join(
  process.cwd(),
  "sanity",
  "seed",
  "dbk-product-migration-manifest.json",
);

function normalize(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadManifest(): ManifestRow[] {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Migration manifest not found: ${manifestPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (!Array.isArray(parsed)) {
    throw new Error("Product migration manifest must contain an array.");
  }

  return parsed as ManifestRow[];
}

function ref(id: string) {
  return {
    _type: "reference",
    _ref: id,
  };
}

function arrayRef(id: string) {
  return {
    _key: `ref-${id.replace(/[^a-zA-Z0-9]/g, "-").slice(-48)}`,
    _type: "reference",
    _ref: id,
  };
}

function equalNullableNumber(a: number | null | undefined, b: number | null | undefined) {
  return (a ?? null) === (b ?? null);
}

function extractDriveFileId(url: string): string | null {
  const match = url.match(/\/file\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

function extensionFromContentType(contentType: string | null): string {
  const type = (contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

async function downloadDriveImage(url: string): Promise<{
  bytes: Buffer;
  contentType: string;
  extension: string;
}> {
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    throw new Error("Could not extract Google Drive file ID.");
  }

  const candidates = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
  ];

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        headers: {
          "User-Agent": "DecorByKasiwa-Sanity-Migration/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const bytes = Buffer.from(await response.arrayBuffer());

      if (!contentType.toLowerCase().startsWith("image/")) {
        const preview = bytes.toString("utf8", 0, Math.min(bytes.length, 160));
        throw new Error(
          `Google Drive returned ${contentType || "unknown content type"} instead of an image. ${preview}`,
        );
      }

      if (bytes.length < 500) {
        throw new Error(`Downloaded image is unexpectedly small (${bytes.length} bytes).`);
      }

      return {
        bytes,
        contentType,
        extension: extensionFromContentType(contentType),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Unable to download Google Drive image.");
}

async function fetchExistingProducts(): Promise<ExistingProduct[]> {
  return client.fetch<ExistingProduct[]>(
    `*[
      _type == "product" &&
      !(_id in path("drafts.**"))
    ]{
      _id,
      name,
      "slug": slug.current,
      sku,
      price,
      initialStock,
      "primaryCategoryRef": primaryCategory._ref,
      "heroAssetRef": heroImage.asset._ref
    }`,
  );
}

function buildIndexes(products: ExistingProduct[]) {
  const byId = new Map<string, ExistingProduct>();
  const bySku = new Map<string, ExistingProduct>();
  const bySlug = new Map<string, ExistingProduct>();
  const byName = new Map<string, ExistingProduct>();

  for (const product of products) {
    byId.set(product._id, product);

    if (product.sku?.trim()) {
      bySku.set(product.sku.trim().toUpperCase(), product);
    }

    if (product.slug?.trim()) {
      bySlug.set(product.slug.trim(), product);
    }

    const normalizedName = normalize(product.name);
    if (normalizedName) {
      byName.set(normalizedName, product);
    }
  }

  return { byId, bySku, bySlug, byName };
}

function matchExisting(
  row: ManifestRow,
  indexes: ReturnType<typeof buildIndexes>,
): { product: ExistingProduct | null; matchedBy: string | null } {
  const byId = indexes.byId.get(row.documentId);
  if (byId) return { product: byId, matchedBy: "documentId" };

  const bySku = indexes.bySku.get(row.sku.toUpperCase());
  if (bySku) return { product: bySku, matchedBy: "sku" };

  const bySlug = indexes.bySlug.get(row.slug);
  if (bySlug) return { product: bySlug, matchedBy: "slug" };

  const byName = indexes.byName.get(normalize(row.name));
  if (byName) return { product: byName, matchedBy: "normalized-name" };

  return { product: null, matchedBy: null };
}

async function verifyTaxonomy(manifest: ManifestRow[]) {
  const required = new Set<string>();

  for (const row of manifest) {
    required.add(row.primaryCategoryRef);
    for (const space of row.spaceRefs) required.add(space);
  }

  const ids = Array.from(required);
  const existing = await client.fetch<string[]>(`*[_id in $ids]._id`, { ids });
  const existingSet = new Set(existing);
  const missing = ids.filter((id) => !existingSet.has(id));

  if (missing.length) {
    throw new Error(
      `Migration stopped because taxonomy references are missing in Sanity:\n${missing
        .map((id) => `  - ${id}`)
        .join("\n")}`,
    );
  }
}

function buildPatch(row: ManifestRow, product: ExistingProduct) {
  const setValues: Record<string, unknown> = {};

  if (product.name !== row.name) setValues.name = row.name;
  if (product.slug !== row.slug) setValues.slug = { _type: "slug", current: row.slug };
  if (product.price !== row.price) setValues.price = row.price;

  if (
    row.initialStock !== null &&
    !equalNullableNumber(product.initialStock, row.initialStock)
  ) {
    setValues.initialStock = row.initialStock;
  }

  if (product.primaryCategoryRef !== row.primaryCategoryRef) {
    setValues.primaryCategory = ref(row.primaryCategoryRef);
  }

  if (row.spaceRefs.length > 0) {
    setValues.spaces = row.spaceRefs.map(arrayRef);
  }

  return setValues;
}

function newProductDocument(row: ManifestRow) {
  return {
    _id: row.documentId,
    _type: "product",
    name: row.name,
    slug: {
      _type: "slug",
      current: row.slug,
    },
    sku: row.sku,
    price: row.price,
    primaryCategory: ref(row.primaryCategoryRef),
    ...(row.spaceRefs.length ? { spaces: row.spaceRefs.map(arrayRef) } : {}),
    ...(row.initialStock !== null ? { initialStock: row.initialStock } : {}),
    featured: false,
    newArrival: false,
    bestSeller: false,
    onSale: false,
    available: row.available,
  };
}

async function migrateHeroImage(
  row: ManifestRow,
  documentId: string,
  currentHeroAssetRef: string | undefined,
): Promise<"UPLOAD" | "PRESERVE" | "SKIP" | "FAILED"> {
  if (!MIGRATE_IMAGES || !row.driveImageUrl) return "SKIP";
  if (currentHeroAssetRef && !OVERWRITE_IMAGES) return "PRESERVE";

  try {
    const downloaded = await downloadDriveImage(row.driveImageUrl);
    const filename = `${row.slug}${downloaded.extension}`;

    const asset = await client.assets.upload("image", downloaded.bytes, {
      filename,
    });

    await client
      .patch(documentId)
      .set({
        heroImage: {
          _type: "image",
          asset: {
            _type: "reference",
            _ref: asset._id,
          },
        },
      })
      .commit();

    return "UPLOAD";
  } catch (error) {
    console.warn(`  Image failed for ${row.name}:`, error);
    return "FAILED";
  }
}

async function writeReport(report: ReportRow[]) {
  const directory = path.join(process.cwd(), "migration-reports");
  fs.mkdirSync(directory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(directory, `dbk-product-migration-${timestamp}.json`);

  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: WRITE ? "WRITE" : "DRY_RUN",
        images: MIGRATE_IMAGES,
        overwriteImages: OVERWRITE_IMAGES,
        totals: {
          rows: report.length,
          created: report.filter((row) => row.action === "CREATE").length,
          patched: report.filter((row) => row.action === "PATCH").length,
          unchanged: report.filter((row) => row.action === "NO_CHANGE").length,
          blocked: report.filter((row) => row.action === "BLOCKED").length,
          failed: report.filter((row) => row.action === "FAILED").length,
          imagesUploaded: report.filter((row) => row.imageAction === "UPLOAD").length,
          imagesFailed: report.filter((row) => row.imageAction === "FAILED").length,
        },
        rows: report,
      },
      null,
      2,
    ),
    "utf8",
  );

  return reportPath;
}

async function main() {
  const manifest = loadManifest();
  const config = client.config();

  console.log("Decor by Kasiwa product migration");
  console.log(`Project: ${config.projectId}`);
  console.log(`Dataset: ${config.dataset}`);
  console.log(`Mode: ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`Drive hero images: ${MIGRATE_IMAGES ? "ENABLED" : "DISABLED"}`);
  console.log(`Overwrite existing hero images: ${OVERWRITE_IMAGES ? "YES" : "NO"}`);
  console.log("");

  const blocked = manifest.filter((row) => row.blockedReason);
  const ready = manifest.filter((row) => !row.blockedReason);
  const categoryReview = manifest.filter((row) => row.categoryReviewRequired);
  const imageMapped = ready.filter((row) => row.driveImageUrl);

  console.log(`Source products: ${manifest.length}`);
  console.log(`Ready (price > 0): ${ready.length}`);
  console.log(`Blocked: ${blocked.length}`);
  console.log(`Category review flags: ${categoryReview.length}`);
  console.log(`Exact Drive image mappings: ${imageMapped.length}`);
  console.log("");

  if (blocked.length) {
    console.log("Blocked products:");
    for (const row of blocked) {
      console.log(`  - ${row.name}: ${row.blockedReason}`);
    }
    console.log("");
  }

  await verifyTaxonomy(ready);

  const existingProducts = await fetchExistingProducts();
  const indexes = buildIndexes(existingProducts);
  const report: ReportRow[] = [];

  console.log(`Published Sanity products found: ${existingProducts.length}`);
  console.log("");

  for (const row of manifest) {
    if (row.blockedReason) {
      report.push({
        name: row.name,
        sourceRow: row.sourceRow,
        action: "BLOCKED",
        note: row.blockedReason,
      });
      continue;
    }

    const match = matchExisting(row, indexes);

    try {
      if (!match.product) {
        console.log(`[CREATE] ${row.name}`);

        if (WRITE) {
          await client.createIfNotExists(newProductDocument(row));
        }

        const imageAction = WRITE
          ? await migrateHeroImage(row, row.documentId, undefined)
          : "SKIP";

        report.push({
          name: row.name,
          sourceRow: row.sourceRow,
          action: "CREATE",
          documentId: row.documentId,
          imageAction,
          note: row.categoryReviewRequired ? row.categoryNote : undefined,
        });

        continue;
      }

      const product = match.product;
      const patchValues = buildPatch(row, product);
      const missingSku = !product.sku?.trim();
      const hasPatch = Object.keys(patchValues).length > 0 || missingSku;

      if (hasPatch) {
        console.log(`[PATCH] ${row.name} (${match.matchedBy})`);

        if (WRITE) {
          let patch = client.patch(product._id);

          if (Object.keys(patchValues).length) {
            patch = patch.set(patchValues);
          }

          if (missingSku) {
            patch = patch.setIfMissing({
              sku: generateProductSku(row.name, product._id),
            });
          }

          await patch.commit();
        }
      } else {
        console.log(`[OK] ${row.name}`);
      }

      const imageAction = WRITE
        ? await migrateHeroImage(row, product._id, product.heroAssetRef)
        : "SKIP";

      report.push({
        name: row.name,
        sourceRow: row.sourceRow,
        action: hasPatch ? "PATCH" : "NO_CHANGE",
        documentId: product._id,
        matchedBy: match.matchedBy || undefined,
        imageAction,
        note: row.categoryReviewRequired ? row.categoryNote : undefined,
      });
    } catch (error) {
      console.error(`[FAILED] ${row.name}`, error);

      report.push({
        name: row.name,
        sourceRow: row.sourceRow,
        action: "FAILED",
        documentId: match.product?._id || row.documentId,
        matchedBy: match.matchedBy || undefined,
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const reportPath = await writeReport(report);

  const created = report.filter((row) => row.action === "CREATE").length;
  const patched = report.filter((row) => row.action === "PATCH").length;
  const unchanged = report.filter((row) => row.action === "NO_CHANGE").length;
  const failed = report.filter((row) => row.action === "FAILED").length;

  console.log("");
  console.log("Summary");
  console.log(`  Create: ${created}`);
  console.log(`  Patch: ${patched}`);
  console.log(`  No change: ${unchanged}`);
  console.log(`  Blocked: ${blocked.length}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Report: ${reportPath}`);

  if (!WRITE) {
    console.log("");
    console.log("Dry run only. No Sanity documents were changed.");
    console.log("To write, set DBK_MIGRATION_WRITE=1 and run the command again.");
  }

  if (WRITE && MIGRATE_IMAGES) {
    console.log("");
    console.log("Image migration used only explicit product-to-Drive mappings.");
    console.log("Existing hero images were preserved unless DBK_OVERWRITE_IMAGES=1.");
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nProduct migration failed before completion:");
  console.error(error);
  process.exitCode = 1;
});
