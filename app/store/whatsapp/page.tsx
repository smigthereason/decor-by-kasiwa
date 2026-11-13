import "server-only";

import { neon } from "@neondatabase/serverless";
import { requireStaffAccess } from "@/lib/auth/authorization";

export const dynamic = "force-dynamic";

const MAIN_DB_HOST = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";
const OTC_MALL_STORE = "storeLocation.4fcbd28b74494e7da7176525e63d73f4";

type Summary = {
  awaitingPayment: number;
  verifiedPaid: number;
  requiresReview: number;
  stockCommitted: number;
};

async function productionOrderSummary(): Promise<Summary | null> {
  if (process.env.VERCEL_ENV !== "production" ||
      process.env.DBK36_WA_PRODUCTION_BRIDGE_ENABLED !== "YES") return null;
  const raw = process.env.DATABASE_URL || "";
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== MAIN_DB_HOST || url.pathname !== "/neondb" ||
      url.searchParams.get("sslmode") !== "require" || !url.password) return null;
  try {
    const sql = neon(raw);
    const rows = await sql`SELECT status, stock_state, count(*)::integer AS total
      FROM public.dbk36_wa_prod_payment_orders
      GROUP BY status, stock_state`;
    const summary: Summary = { awaitingPayment: 0, verifiedPaid: 0, requiresReview: 0, stockCommitted: 0 };
    for (const row of rows) {
      const n = Number(row.total) || 0;
      if (["quoted", "starting", "prompt_sent"].includes(String(row.status))) summary.awaitingPayment += n;
      if (row.status === "paid") summary.verifiedPaid += n;
      if (row.status === "review_required" || row.stock_state === "REVIEW_REQUIRED") summary.requiresReview += n;
      if (row.status === "paid" && row.stock_state === "COMMITTED") summary.stockCommitted += n;
    }
    return summary;
  } catch {
    // No exception details or database configuration are exposed to staff.
    return null;
  }
}

export default async function StoreWhatsAppSalesPage() {
  const { customer, role } = await requireStaffAccess("STORE", "/store/whatsapp");
  // The WhatsApp production stock flow is currently pinned to the OTC Mall store.
  // Never show another store's order metrics merely because somebody can sign in.
  const assignedStore = customer.assignedStore?._id;
  const storeInScope = role === "ADMIN" || assignedStore === OTC_MALL_STORE;
  const canReadSummary = storeInScope && (
    ["ADMIN", "STORE", "MANAGER"].includes(role) ||
    (role === "STORE_STAFF" && customer.permissions?.includes("WHATSAPP_SALES") === true)
  );
  const summary = canReadSummary ? await productionOrderSummary() : null;

  const cards = summary ? [
    ["Awaiting payment", summary.awaitingPayment],
    ["Verified paid", summary.verifiedPaid],
    ["Needs reconciliation", summary.requiresReview],
    ["Stock posted", summary.stockCommitted],
  ] as const : [];

  return (
    <main className="mx-auto max-w-5xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Store operations · Read-only</p>
        <h1 className="text-3xl font-medium tracking-tight">WhatsApp Sales</h1>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          View the WhatsApp sales channel from your store workspace. This screen cannot start M-Pesa payments,
          confirm merchant Till receipts, deduct stock, or change orders.
        </p>
      </header>
      <section className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
        <h2 className="text-lg font-semibold">OTC Mall WhatsApp order summary</h2>
        {!storeInScope ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Your account is not assigned to the OTC Mall store. This channel's order totals are restricted to authorized store staff.
          </p>
        ) : !canReadSummary ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Your role does not include order-summary access.</p>
        ) : summary ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[var(--ink)]/10 bg-[var(--paper-2)] p-4">
                <p className="text-xs text-[var(--muted)]">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">
            A live read-only summary is temporarily unavailable. No orders or payments were changed.
          </p>
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5">
          <h2 className="font-semibold">Customer conversations</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Public WhatsApp messaging remains restricted until the official business number and Meta credentials are connected.
          </p>
        </article>
        <article className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5">
          <h2 className="font-semibold">Payments and stock</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Only authorized administrators can reconcile payments, approve fulfillment changes or post stock.
            Contact an administrator if an order needs attention.
          </p>
        </article>
      </section>
    </main>
  );
}
