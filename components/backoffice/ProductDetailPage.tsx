"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, Check, MapPin, Pencil, X } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { mutateBackoffice, useLiveOperations } from "@/lib/operations/client";
import type { InventoryItem } from "@/lib/operations/types";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";

type Mode = "admin" | "store";

export default function ProductDetailPage({ mode }: { mode: Mode }) {
  const params = useParams<{ id: string }>();
  const productId = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const product = data?.products.find((item) => item.id === productId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<InventoryItem | null>(null);

  useEffect(() => {
    if (product) setDraft(product);
  }, [product]);

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  const basePath = mode === "admin" ? "/admin/products" : "/store/products";

  if (!product || !draft) {
    return (
      <div className="p-6">
        <Link href={basePath} className="text-sm underline">Back to products</Link>
        <p className="mt-8 text-sm text-[var(--muted)]">Product not found in the live Sanity catalogue.</p>
      </div>
    );
  }

  const liveProductId = product.id;

  async function save() {
    if (!draft || saving) return;
    const payload: Record<string, unknown> = {
      onHand: draft.onHand,
      reserved: draft.reserved,
      incoming: draft.incoming,
      reorderPoint: draft.reorderPoint,
      unitCost: draft.unitCost,
      retailPrice: draft.retailPrice,
      location: draft.location,
      available: draft.available,
    };

    setSaving(true);
    setMessage(null);
    try {
      await mutateBackoffice(
        `/api/backoffice/products/${encodeURIComponent(liveProductId)}`,
        payload,
      );
      await refresh();
      setEditing(false);
      setMessage("Live product and inventory values updated in Sanity.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href={basePath} className="group mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" /> Back to products
            </Link>
            <p className="kicker text-[var(--muted)]">{product.sku}</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl lg:text-4xl">{product.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{product.category}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]">
                <Pencil size={14} /> Edit live values
              </button>
            ) : (
              <>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">
                  <Check size={14} /> {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => { setDraft(product); setEditing(false); }} className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1.5fr] lg:p-8">
        <div className="space-y-4">
          <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <div className="aspect-[4/3] overflow-hidden rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center" style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}>
              {!product.image && <div className="grid h-full place-items-center"><Boxes size={32} className="text-[var(--muted)]" /></div>}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <StatusPill value={stockStatus(product)} />
              <p className="text-sm font-semibold">{formatKes(product.retailPrice)}</p>
            </div>
          </div>

          <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Location</p>
            {editing ? (
              <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className="mt-3 w-full rounded-lg border hairline px-4 py-3 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10" />
            ) : (
              <p className="mt-3 flex items-center gap-3 text-sm"><MapPin size={16} className="text-[var(--muted)]" />{product.location}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="text-lg font-medium tracking-[-0.02em]">Live stock details</h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([[
              "On Hand", "onHand",
            ], [
              "Reserved", "reserved",
            ], [
              "Incoming", "incoming",
            ], [
              "Reorder", "reorderPoint",
            ]] as const).map(([label, field]) => (
              <div key={field} className="rounded-lg border hairline p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
                {editing ? (
                  <input type="number" min={0} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: Number(e.target.value) })} className="mt-2 w-full rounded-md border hairline px-3 py-2.5 text-sm outline-none transition focus:border-[var(--deep-green)]" />
                ) : (
                  <p className="mt-2 text-2xl font-medium">{product[field]}</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 border-t hairline pt-5 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Available</p>
              <p className="mt-2 text-lg font-semibold">{availableStock(product)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Retail price</p>
              {editing ? (
                <input type="number" min={0} value={draft.retailPrice} onChange={(e) => setDraft({ ...draft, retailPrice: Number(e.target.value) })} className="mt-2 w-full rounded-md border hairline px-3 py-2.5 text-sm outline-none transition focus:border-[var(--deep-green)]" />
              ) : (
                <p className="mt-2 text-lg font-semibold">{formatKes(product.retailPrice)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Shop visibility</p>
              {editing ? (
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.available !== false} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Available</label>
              ) : (
                <p className="mt-2 text-lg font-semibold">{product.available === false ? "Hidden" : "Available"}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
