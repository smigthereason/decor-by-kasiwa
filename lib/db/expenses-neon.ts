import "server-only";
import { createHash } from "node:crypto";
import { getNeonSql } from "@/lib/db/neon";

// Only enabled after schema migration and verification. Never silently fall back to Sanity
// after a database error: doing so could duplicate a financial transaction.
export const expenseBackendIsNeon = () => process.env.DBK_EXPENSE_BACKEND === "neon";
// Keep Neon historical records visible even if new writes are paused or rolled back.
export const expenseReadsIncludeNeon = () => expenseBackendIsNeon() || process.env.DBK_EXPENSE_READ_NEON === "1";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");

export type NeonExpense = {
  id: string; expenseNumber: string; expenseType: string;
  ledgerAccount: string; expenseCategory?: string; staffName?: string;
  description: string; amount: number; paymentMethod: string;
  transactionReference?: string; expenseDate: string; createdByName: string;
  createdById: string; createdByRole: string; createdAt: string;
  storeLocationId?: string; storeLocationName?: string; storeLocationCode?: string;
};

type WriteInput = Omit<NeonExpense, "id" | "expenseNumber" | "expenseDate" | "createdAt"> & {
  suppliedExpenseDate?: string;
  idempotencyKey: string;
};

function asExpense(value: unknown): NeonExpense {
  if (typeof value === "string") return JSON.parse(value) as NeonExpense;
  return value as NeonExpense;
}

export async function insertNeonExpense(input: WriteInput) {
  // Idempotency key MUST be supplied by the updated POS client and reused on retries.
  if (!/^[a-f0-9-]{36}$/i.test(input.idempotencyKey)) {
    throw new Error("Refresh the Expenditure form before saving. A submission key is required.");
  }
  const idHash = digest(`${input.createdById}|${input.idempotencyKey}`);
  const id = `expenseTransaction.neon.${idHash.slice(0, 24)}`;
  const expenseNumber = `EXP-${idHash.slice(0, 12).toUpperCase()}`;
  // Do not include server-generated timestamps in the payload fingerprint: the same
  // request may be retried after a timeout with a different clock time.
  const { idempotencyKey: _key, ...stableInput } = input;
  void _key;
  const payloadHash = digest(JSON.stringify(stableInput));
  const now = new Date().toISOString();
  const validDate = input.suppliedExpenseDate && !Number.isNaN(Date.parse(input.suppliedExpenseDate))
    ? new Date(input.suppliedExpenseDate).toISOString() : now;
  const { suppliedExpenseDate: _date, ...fields } = stableInput;
  void _date;
  const expense: NeonExpense = { ...fields, id, expenseNumber, expenseDate: validDate, createdAt: now };
  const sql = getNeonSql();
  await sql`INSERT INTO dbk_expense_records
      (id, request_key, payload_hash, payload, expense_date, store_location_id, created_at)
      VALUES (${id}, ${idHash}, ${payloadHash}, ${JSON.stringify(expense)}::jsonb,
              ${validDate}::timestamptz, ${expense.storeLocationId || null}, ${now}::timestamptz)
      ON CONFLICT (id) DO NOTHING`;
  const records = await sql`SELECT payload_hash, payload FROM dbk_expense_records WHERE id=${id}`;
  const row = records[0] as { payload_hash: string; payload: unknown } | undefined;
  if (!row) throw new Error("Unable to verify saved expenditure. Check history before retrying.");
  if (row.payload_hash !== payloadHash) {
    throw new Error("This submission key has already been used with different expenditure details. Check history before retrying.");
  }
  const saved = asExpense(row.payload);
  return { id: saved.id, expenseNumber: saved.expenseNumber };
}

export async function listNeonExpenses(limit = 150, storeId?: string) {
  const sql = getNeonSql();
  const id = storeId || null;
  const rows = await sql`SELECT payload FROM dbk_expense_records
    WHERE (${id}::text IS NULL OR store_location_id = ${id})
    ORDER BY expense_date DESC, created_at DESC LIMIT ${Math.max(1, Math.min(500, limit))}`;
  return rows.map((row) => asExpense(row.payload));
}

export async function listNeonExpensesInRange(start: string, end: string, storeId?: string) {
  const sql = getNeonSql();
  const id = storeId || null;
  const rows = await sql`SELECT payload FROM dbk_expense_records
    WHERE expense_date >= ${start}::timestamptz AND expense_date <= ${end}::timestamptz
    AND (${id}::text IS NULL OR store_location_id = ${id})`;
  return rows.map((row) => asExpense(row.payload));
}

export async function countNeonStoreExpenses(storeId: string) {
  const sql = getNeonSql();
  const result = await sql`SELECT COUNT(*)::integer AS total FROM dbk_expense_records WHERE store_location_id=${storeId}`;
  return Number(result[0]?.total || 0);
}

export function expenseAuditRecord(e: NeonExpense) {
  return {
    id: `auditEvent.neon.${e.id.replace(/^expenseTransaction\.neon\./, "")}`,
    eventNumber: `AUD-${e.expenseNumber.slice(4)}`,
    eventType: "EXPENSE_RECORDED",
    entityType: "expenseTransaction",
    entityId: e.id,
    entityLabel: e.expenseNumber,
    actorName: e.createdByName,
    actorRole: e.createdByRole,
    detail: `${e.storeLocationName || "Company-wide"} · ${e.ledgerAccount} · ${e.expenseType} · KES ${e.amount.toLocaleString("en-KE")} · ${e.description}`,
    createdAt: e.createdAt,
  };
}

export async function listNeonExpenseAudit(limit = 150, since?: string) {
  const sql = getNeonSql();
  const date = since || null;
  const rows = await sql`SELECT payload FROM dbk_expense_records
    WHERE (${date}::timestamptz IS NULL OR created_at >= ${date}::timestamptz)
    ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(10000, limit))}`;
  return rows.map((row) => expenseAuditRecord(asExpense(row.payload)));
}

export async function countNeonExpenseAudits() {
  const sql = getNeonSql();
  const result = await sql`SELECT COUNT(*)::integer AS total FROM dbk_expense_records`;
  return Number(result[0]?.total || 0);
}
