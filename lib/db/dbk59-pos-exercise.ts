import "server-only";
import { neon } from "@neondatabase/serverless";
import type { DBK57ManualPosInput } from "@/lib/db/pos-manual-transaction-neon";

/**
 * This wrapper NEVER writes to DATABASE_URL, even in development. It accepts
 * only the pinned, isolated dbk51-test branch URL and uses a PostgreSQL
 * rollback-only function. No production gate can invoke this function.
 */
const PINNED_TEST_HOST = "ep-green-sea-ba4sybzn-pooler.c-8.eu-central-1.aws.neon.tech";
const KNOWN_PRODUCTION_HOST = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";

export async function exerciseDBK59ManualSale(candidate: DBK57ManualPosInput) {
  if (process.env.NODE_ENV !== "development" ||
      process.env.DBK58_LOCAL_PREVIEW !== "YES" ||
      process.env.DBK59_LOCAL_EXERCISE !== "YES" ||
      process.env.DBK59_TEST_WRITE !== "YES" ||
      !process.env.DBK59_TEST_DATABASE_URL) {
    throw new Error("DBK-59 isolated exercise disabled");
  }
  const testUrl = new URL(process.env.DBK59_TEST_DATABASE_URL);
  const prodHost = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
  if (testUrl.hostname === KNOWN_PRODUCTION_HOST ||
      testUrl.hostname !== PINNED_TEST_HOST ||
      testUrl.hostname === prodHost ||
      testUrl.pathname !== "/neondb" ||
      testUrl.protocol !== "postgresql:") {
    throw new Error("DBK-59 refused database identity: only the pinned isolated dbk51-test branch is allowed");
  }
  if (!candidate || candidate.cashierConfirmed !== true ||
      !candidate.requestKey.startsWith("dbk58-manual-") ||
      !candidate.order.orderId.startsWith("dbk58.order.") ||
      !candidate.order.orderNumber.startsWith("DBK58-TEST-") ||
      candidate.order.channel !== "POS" ||
      candidate.order.currency !== "KES" ||
      candidate.payment.provider !== "manual" ||
      !candidate.payment.providerReference.startsWith("DBK58-TEST-") ||
      !candidate.payment.evidenceReference.startsWith("synthetic-") ||
      candidate.payment.orderId !== candidate.order.orderId) {
    throw new Error("DBK-59 requires a synthetic DBK-58 candidate");
  }
  const { requestKey, ...payload } = candidate;
  const sql = neon(process.env.DBK59_TEST_DATABASE_URL);
  const records = await sql`SELECT public.dbk59_rollback_manual_sale(
    ${requestKey}, ${JSON.stringify(payload)}::jsonb) AS result`;
  const result = records[0]?.result as Record<string, unknown> | undefined;
  if (!result || result.rolledBack !== true || result.stockCommittedInTrial !== true) {
    throw new Error("DBK-59 did not confirm rollback");
  }
  return result;
}
