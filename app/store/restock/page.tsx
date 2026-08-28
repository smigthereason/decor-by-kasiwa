"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Search } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { RestockReason } from "@/lib/operations/types";
import { availableStock, stockStatus } from "@/lib/operations/selectors";

const reasons: { value: RestockReason; label: string }[] = [
  { value: "out_of_stock", label: "Out of stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "needs_restock", label: "Needs restocking" },
];

export default function RestockAlertsPage() {
  const { data, loading, error, refresh } = useLiveOperations();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState<RestockReason>("needs_restock");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const products = useMemo(() => {
    const rows = data?.products || [];
    if (!search) return rows;
    const term = search.toLowerCase();
    return rows.filter((item) =>
      [item.name, item.sku, item.category].some((value) => value.toLowerCase().includes(term)),
    );
  }, [data?.products, search]);

  const openByProduct = useMemo(
    () => new Set((data?.restockRequests || []).filter((item) => item.status !== "resolved").map((item) => item.productId)),
    [data?.restockRequests],
  );

  async function submit() {
    if (!selectedId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await mutateBackoffice(
        "/api/backoffice/restock-requests",
        { productId: selectedId, reason, note },
        "POST",
      );
      await refresh();
      setSelectedId("");
      setNote("");
      setReason("needs_restock");
      setMessage("Manager/Admin alerted. The restock request is now visible in Products.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Restock alert could not be sent.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  const selectedProduct = data.products.find((item) => item.id === selectedId);

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Restock alerts</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Flag stock issues early</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          Alert the Store Manager and Admin when a product is unavailable, low, or needs replenishment. Only one open alert is allowed per product.
        </p>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product to report..."
              className="w-full rounded-full border hairline py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            />
          </div>

          <div className="mt-4 max-h-[560px] divide-y hairline overflow-y-auto rounded-lg border hairline">
            {products.map((product) => {
              const open = openByProduct.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={open}
                  onClick={() => setSelectedId(product.id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-[var(--paper-2)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <div>
                    <p className="text-sm font-semibold">{product.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{product.sku} · Available {availableStock(product)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill value={stockStatus(product)} />
                    {open && <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Alert open</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <p className="kicker text-[var(--muted)]">Create alert</p>
          {selectedProduct ? (
            <>
              <div className="mt-4 rounded-lg bg-[var(--paper-2)] p-4">
                <p className="text-sm font-semibold">{selectedProduct.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{selectedProduct.sku} · {selectedProduct.category}</p>
              </div>

              <label className="mt-5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Reason</label>
              <div className="relative mt-2">
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RestockReason)}
                  className="min-h-11 w-full cursor-pointer appearance-none rounded-lg border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
                >
                  {reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              </div>

              <label className="mt-5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Note (optional)</label>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for the manager..."
                className="mt-2 w-full rounded-lg border hairline bg-[var(--paper)] px-4 py-3 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
              />

              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50"
              >
                <AlertTriangle size={14} /> {saving ? "Sending…" : "Alert manager / admin"}
              </button>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed hairline p-8 text-center">
              <CheckCircle2 size={28} className="mx-auto text-[var(--muted)]" />
              <p className="mt-3 text-sm font-medium">Select a product</p>
              <p className="mt-2 text-xs text-[var(--muted)]">Choose a product from the list to create a restock alert.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
