import "server-only";
import { createHash } from "node:crypto";
import { getNeonSql } from "@/lib/db/neon";
import { canonicalDocument, validateRestorableMovement, type MovementRow } from "@/lib/inventory/dbk83-history-core";

const PINNED_HOST = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";
export const dbk83ArchiveReadsEnabled = () => process.env.DBK83_MOVEMENT_ARCHIVE_READS === "YES";
function requirePinnedProduction() {
  const url = process.env.DATABASE_URL;
  if (!url || new URL(url).hostname !== PINNED_HOST) throw new Error("DBK-83 requires pinned production Neon database");
}
type ArchivedRow = { sanity_id: string; source_revision: string; source_sha256: string; document_json: Record<string, unknown> };
function formatRow(row: ArchivedRow): MovementRow {
  const doc = row.document_json;
  if (doc._id !== row.sanity_id || doc._rev !== row.source_revision || doc._type !== "inventoryMovement") {
    throw new Error("DBK-83 archive identity mismatch");
  }
  return {
    _id: row.sanity_id, _rev: row.source_revision,
    movementNumber: doc.movementNumber, movementType: doc.movementType,
    productName: doc.productName, variantId: doc.variantId, variantLabel: doc.variantLabel,
    quantityChange: doc.quantityChange, correctedQuantity: doc.correctedQuantity,
    correctedAt: doc.correctedAt, correctedBy: doc.correctedBy,
    correctionReason: doc.correctionReason, voidedAt: doc.voidedAt, voidedBy: doc.voidedBy,
    stockBefore: doc.stockBefore, stockAfter: doc.stockAfter,
    incomingBefore: doc.incomingBefore, incomingAfter: doc.incomingAfter,
    sourceLocation: doc.sourceLocation, destination: doc.destination,
    sourceStoreId: (doc.sourceStore as { _ref?: string } | undefined)?._ref || "",
    destinationStoreId: (doc.destinationStore as { _ref?: string } | undefined)?._ref || "",
    unitCost: doc.unitCost, movementValue: doc.correctedMovementValue ?? doc.movementValue,
    actorName: doc.actorName, note: doc.note,
    createdAt: typeof doc.createdAt === "string" ? doc.createdAt : undefined,
    archived: true,
  };
}

export async function dbk83ListArchivedMovements(filters: {
  pattern: string; from: string; to: string; type: string; scope: string; skuProductIds: string[]; limit: number;
}): Promise<MovementRow[]> {
  if (!dbk83ArchiveReadsEnabled()) return [];
  requirePinnedProduction();
  const {pattern, from, to, type, scope, limit, skuProductIds} = filters;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10051) throw new Error("Invalid DBK-83 page limit");
  const skuIds = JSON.stringify(skuProductIds);
  const rows = await getNeonSql()`
    SELECT sanity_id,source_revision,source_sha256,document_json
    FROM public.dbk82_inventory_movement_archive
    WHERE document_json->>'movementType' IN ('PURCHASE','RECEIPT','TRANSFER')
      AND (${type}='' OR document_json->>'movementType'=${type})
      AND (${scope}='' OR document_json->'sourceStore'->>'_ref'=${scope} OR document_json->'destinationStore'->>'_ref'=${scope})
      AND (${from}='' OR document_json->>'createdAt'>=${from})
      AND (${to}='' OR document_json->>'createdAt'<${to})
      AND (${pattern}='' OR lower(concat_ws(' ',document_json->>'productName',document_json->>'variantLabel',
          document_json->>'movementNumber',document_json->>'note',document_json->>'actorName')) LIKE ${pattern}
          OR ${skuIds}::jsonb ? coalesce(document_json->>'productId',''))
    ORDER BY document_json->>'createdAt' DESC,sanity_id DESC
    LIMIT ${limit}`;
  return (rows as ArchivedRow[]).map(formatRow);
}

export async function dbk83ListArchivedPurchases(from: string) {
  if (!dbk83ArchiveReadsEnabled()) return [];
  requirePinnedProduction();
  const rows = await getNeonSql()`
    SELECT sanity_id,source_revision,source_sha256,document_json
    FROM public.dbk82_inventory_movement_archive
    WHERE document_json->>'createdAt'>=${from}
      AND (document_json->>'movementType'='PURCHASE' OR
        (document_json->>'movementType'='RECEIPT' AND NOT document_json ? 'incomingBefore'))
    ORDER BY document_json->>'createdAt' DESC`;
  return (rows as ArchivedRow[]).map(row => ({
    _id: row.sanity_id, createdAt: row.document_json.createdAt as string,
    quantityChange: row.document_json.quantityChange as number | undefined,
    movementValue: (row.document_json.correctedMovementValue ?? row.document_json.movementValue) as number | undefined,
    unitCost: row.document_json.unitCost as number | undefined,
  }));
}

// Restoration is an explicit operator action. No inventory mutations happen here.
// The existing Sanity PATCH performs any later stock correction atomically.
export async function dbk83GetVerifiedRestorableMovement(id: string) {
  if (!dbk83ArchiveReadsEnabled()) throw new Error("DBK-83 archive reads disabled");
  requirePinnedProduction();
  const rows = await getNeonSql()`
    SELECT sanity_id,source_revision,source_sha256,document_json
    FROM public.dbk82_inventory_movement_archive WHERE sanity_id=${id} LIMIT 1`;
  const row = (rows as ArchivedRow[])[0];
  if (!row) throw new Error("Archived movement not found");
  const hash = createHash("sha256").update(JSON.stringify(canonicalDocument(row.document_json))).digest("hex");
  if (hash !== row.source_sha256) throw new Error("Archived movement checksum mismatch");
  return validateRestorableMovement(row.document_json, id, row.source_revision);
}
