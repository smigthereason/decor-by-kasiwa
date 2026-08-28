"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock3 } from "lucide-react";

import { mutateBackoffice } from "@/lib/operations/client";
import type { RestockRequest } from "@/lib/operations/types";
import { formatDateTime } from "@/lib/operations/selectors";

export default function RestockRequestsPanel({
  requests,
  onChanged,
}: {
  requests: RestockRequest[];
  onChanged: () => Promise<void> | void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const open = requests.filter((request) => request.status !== "resolved");

  async function resolve(id: string) {
    setSavingId(id);
    setMessage(null);
    try {
      await mutateBackoffice(
        `/api/backoffice/restock-requests/${encodeURIComponent(id)}`,
        { status: "resolved" },
      );
      await onChanged();
      setMessage("Restock alert resolved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Restock alert update failed.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker text-[var(--muted)]">Staff restock alerts</p>
          <h2 className="mt-2 text-xl font-medium tracking-[-0.03em]">
            Products flagged by Sales Staff
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            Sales Staff can flag products that are unavailable or running low. Resolve the alert after inventory has been reviewed or replenished.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--paper-2)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
          <AlertTriangle size={13} /> {open.length} open
        </span>
      </div>

      {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {open.slice(0, 8).map((request) => (
          <article key={request.id} className="rounded-lg border hairline bg-[var(--paper-2)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{request.productName}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {request.sku} · {request.reason.replaceAll("_", " ")}
                </p>
              </div>
              <span className="rounded-full border hairline bg-[var(--paper)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em]">
                {request.status}
              </span>
            </div>
            {request.note && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{request.note}</p>}
            <div className="mt-4 flex flex-col gap-3 border-t hairline pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                <Clock3 size={12} /> {request.requestedByName} · {formatDateTime(request.createdAt)}
              </p>
              <button
                type="button"
                disabled={savingId === request.id}
                onClick={() => void resolve(request.id)}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-[9px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50"
              >
                <Check size={12} /> {savingId === request.id ? "Saving…" : "Resolve"}
              </button>
            </div>
          </article>
        ))}

        {open.length === 0 && (
          <div className="lg:col-span-2 rounded-lg border border-dashed hairline p-8 text-center text-xs text-[var(--muted)]">
            No open restock alerts.
          </div>
        )}
      </div>
    </section>
  );
}
