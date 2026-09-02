"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Boxes, Check, ImagePlus, MapPin, Pencil, Trash2, X } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import type { InventoryItem } from "@/lib/operations/types";
import { availableStock, formatKes, stockStatus } from "@/lib/operations/selectors";

type Mode = "admin" | "store";

export default function ProductDetailPage({ mode }: { mode: Mode }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = decodeURIComponent(params.id);
  const { data, loading, error, refresh } = useLiveOperations();
  const product = data?.products.find((item) => item.id === productId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<InventoryItem | null>(null);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (product) setDraft(product);
  }, [product]);

  useEffect(() => {
    if (!heroImageFile) {
      setHeroPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(heroImageFile);
    setHeroPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [heroImageFile]);

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
  const displayedImage = heroPreviewUrl || product.image;

  function cancelEdit() {
    setDraft(product ?? null);
    setHeroImageFile(null);
    setMessage(null);
    setEditing(false);
  }

  async function deleteProduct() {
    if (mode !== "admin" || deleting) return;
    const confirmed = window.confirm(`Delete ${product?.name || "this product"}? This permanently removes products that are not already referenced by orders or curated content.`);
    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/backoffice/products/${encodeURIComponent(liveProductId)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "Product deletion failed.");
      router.push("/admin/products");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Product deletion failed.");
      setDeleting(false);
    }
  }

  async function save() {
    if (!draft || saving) return;

    if (!draft.name.trim()) {
      setMessage("Product name cannot be empty.");
      return;
    }

    const payload = new FormData();
    payload.set("name", draft.name.trim());
    payload.set("shortDescription", draft.shortDescription || "");
    payload.set("description", draft.description || "");
    payload.set("onHand", String(draft.onHand));
    payload.set("reserved", String(draft.reserved));
    payload.set("incoming", String(draft.incoming));
    payload.set("reorderPoint", String(draft.reorderPoint));
    if (draft.ecommerceEnabled === false && draft.posEnabled === false) {
      setMessage("Select at least one sales channel: E-commerce or POS.");
      return;
    }
    payload.set("unitCost", String(draft.unitCost));
    payload.set("ecommerceEnabled", String(draft.ecommerceEnabled !== false));
    payload.set("posEnabled", String(draft.posEnabled !== false));
    payload.set("retailPrice", String(draft.retailPrice));
    payload.set("location", draft.location);
    payload.set("available", String(draft.available !== false));
    payload.set("bestSeller", String(draft.bestSeller === true));
    if (heroImageFile) payload.set("heroImage", heroImageFile);

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/backoffice/products/${encodeURIComponent(liveProductId)}`, {
        method: "PATCH",
        body: payload,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "Product update failed.");

      await refresh();
      setHeroImageFile(null);
      setEditing(false);
      setMessage("Product details, image and live inventory updated in Sanity.");
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
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] sm:text-3xl lg:text-4xl">{editing ? draft.name : product.name}</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">{product.category}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <>
                {mode === "admin" ? (
                  <Link href={`/admin/products/${encodeURIComponent(liveProductId)}/edit`} className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]">
                    <Pencil size={14} /> Edit all details
                  </Link>
                ) : (
                  <button type="button" onClick={() => { setMessage(null); setEditing(true); }} className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]">
                    <Pencil size={14} /> Edit product
                  </button>
                )}
                {mode === "admin" && (
                  <button type="button" disabled={deleting} onClick={() => void deleteProduct()} className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete product"}
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">
                  <Check size={14} /> {saving ? "Saving…" : "Save product"}
                </button>
                <button type="button" disabled={saving} onClick={cancelEdit} className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] disabled:opacity-50">
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[0.85fr_1.5fr] lg:p-8">
        <div className="space-y-4">
          <div className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Product image</p>
            <div
              className="mt-4 aspect-[4/3] overflow-hidden rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
              style={displayedImage ? { backgroundImage: `url("${displayedImage}")` } : undefined}
            >
              {!displayedImage && <div className="grid h-full place-items-center"><Boxes size={32} className="text-[var(--muted)]" /></div>}
            </div>
            {editing && (
              <label className="mt-4 block rounded-xl border border-dashed hairline bg-[var(--paper-2)] p-4">
                <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]"><ImagePlus size={14} /> Replace hero image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setHeroImageFile(event.target.files?.[0] || null)}
                  className="mt-3 block w-full text-xs"
                />
                <span className="mt-2 block text-[10px] leading-4 text-[var(--muted)]">Leave empty to keep the current image. Maximum 12 MB.</span>
              </label>
            )}
            <div className="mt-4 flex items-center justify-between">
              <StatusPill value={stockStatus(product)} />
              <p className="text-sm font-semibold">{formatKes(draft.retailPrice)}</p>
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

        <div className="space-y-4">
          <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="kicker text-[var(--muted)]">Catalogue content</p>
                <h2 className="mt-2 text-lg font-medium tracking-[-0.02em]">Product details</h2>
              </div>
              {!editing && <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Customer-facing</span>}
            </div>

            {editing ? (
              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Product name</span>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="min-h-11 rounded-lg border hairline px-3 text-sm outline-none transition focus:border-[var(--deep-green)]" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Short description</span>
                  <textarea rows={3} value={draft.shortDescription || ""} onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })} className="rounded-lg border hairline p-3 text-sm leading-6 outline-none transition focus:border-[var(--deep-green)]" />
                </label>
                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Full description</span>
                  <textarea rows={7} value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="rounded-lg border hairline p-3 text-sm leading-6 outline-none transition focus:border-[var(--deep-green)]" />
                </label>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Short description</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{product.shortDescription || "No short description added yet."}</p>
                </div>
                <div className="border-t hairline pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Full description</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{product.description || "No full description added yet."}</p>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
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

            <div className="mt-6 grid gap-4 border-t hairline pt-5 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Procurement cost</p>
                {editing ? (
                  <input type="number" min={0} value={draft.unitCost} onChange={(e) => setDraft({ ...draft, unitCost: Number(e.target.value) })} className="mt-2 w-full rounded-md border hairline px-3 py-2.5 text-sm outline-none transition focus:border-[var(--deep-green)]" />
                ) : (
                  <p className="mt-2 text-lg font-semibold">{formatKes(product.unitCost)}</p>
                )}
              </div>
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
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Sales channels</p>
                {editing ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.ecommerceEnabled !== false} onChange={(e) => setDraft({ ...draft, ecommerceEnabled: e.target.checked })} /> E-commerce</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.posEnabled !== false} onChange={(e) => setDraft({ ...draft, posEnabled: e.target.checked })} /> POS</label>
                  </div>
                ) : (
                  <p className="mt-2 text-sm font-semibold">{[product.ecommerceEnabled !== false ? "E-commerce" : null, product.posEnabled !== false ? "POS" : null].filter(Boolean).join(" + ")}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Shop visibility</p>
                {editing ? (
                  <div className="mt-3 grid gap-2 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.available !== false} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Available</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.bestSeller === true} onChange={(e) => setDraft({ ...draft, bestSeller: e.target.checked })} /> Best seller</label>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-lg font-semibold">{product.available === false ? "Hidden" : "Available"}</span>
                    {product.bestSeller && <span className="self-center rounded-full bg-[var(--deep-green)] px-2.5 py-1 text-[9px] font-semibold uppercase !text-soft-cream">Best seller</span>}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
