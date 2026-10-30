// DBK-83: deterministic merged history. Pure helpers for regression testing.
export type MovementRow = Record<string, unknown> & { _id: string; createdAt?: string; _rev?: string; archived?: boolean };
export function mergeMovementHistory(live: MovementRow[], archived: MovementRow[], neon: MovementRow[], offset: number, size = 50) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1) throw new Error("Invalid pagination");
  const seen = new Map<string, MovementRow>();
  // Read precedence: archived snapshot < newer Neon movement < current Sanity revision.
  for (const row of [...archived, ...neon, ...live]) {
    if (!row._id) throw new Error("Movement with missing identifier");
    seen.set(row._id, row);
  }
  const sorted = [...seen.values()].sort((a,b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || b._id.localeCompare(a._id));
  return { movements: sorted.slice(offset, offset + size), hasMore: sorted.length > offset + size };
}
export function movementQueryPattern(query: string) {
  const terms = query.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return terms.length ? `%${terms.join("%")}%` : "";
}
export function isHistoricalPurchase(doc: Record<string, unknown>) {
  return doc.movementType === "PURCHASE" || (doc.movementType === "RECEIPT" && doc.incomingBefore === undefined);
}
export function canonicalDocument(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalDocument);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, canonicalDocument(o[k])]));
  }
  return value;
}
export function validateRestorableMovement(doc: Record<string, unknown>, id: string, revision: string) {
  if (!id.startsWith("inventoryMovement.") || doc._id !== id || doc._rev !== revision || doc._type !== "inventoryMovement") {
    throw new Error("Archive document identity mismatch");
  }
  if (!["PURCHASE", "RECEIPT", "TRANSFER"].includes(String(doc.movementType || ""))) throw new Error("Unsupported archived movement type");
  if (typeof doc.productId !== "string" || typeof doc.createdAt !== "string") throw new Error("Archived movement lacks required fields");
  return Object.fromEntries(Object.entries(doc).filter(([key]) => !["_rev", "_createdAt", "_updatedAt"].includes(key)));
}
