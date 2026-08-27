"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Check, X, Trash2, Boxes, MapPin, TrendingUp } from "lucide-react";

import StatusPill from "@/components/backoffice/StatusPill";
import { inventory } from "@/lib/operations/data";
import { storeProducts } from "@/lib/products";
import type { InventoryItem } from "@/lib/operations/types";
import {
  availableStock,
  formatKes,
  stockStatus,
} from "@/lib/operations/selectors";

const initialInventory: InventoryItem[] = inventory.map((item) => {
  const catalogueProduct = storeProducts.find(
    (product) =>
      product.id === item.productId ||
      product.name.toLowerCase() === item.name.toLowerCase()
  );

  return {
    ...item,
    image: item.image || catalogueProduct?.heroImage,
  };
});

export default function AdminProductDetailPage() {
  const params = useParams();
  const productId = params.id as string;

  const [products, setProducts] = useState<InventoryItem[]>(initialInventory);
  const [editing, setEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState<InventoryItem | null>(null);

  const product = products.find((item) => item.id === productId);

  if (!product) notFound();

  function handleEdit() {
    setEditedProduct({ ...product! });
    setEditing(true);
  }

  function handleSave() {
    if (editedProduct) {
      setProducts((current) =>
        current.map((item) =>
          item.id === productId ? editedProduct : item
        )
      );
      setEditing(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setEditedProduct(null);
  }

  function handleDelete() {
    setProducts((current) => current.filter((item) => item.id !== productId));
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin/products"
              className="group mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
              Back to products
            </Link>
            <p className="kicker text-[var(--muted)]">{product.sku}</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.03em] sm:text-3xl lg:text-4xl">
              {product.name}
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {product.category} · {product.finish || "Standard"}
            </p>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button
                  type="button"
                  onClick={handleEdit}
                  className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-all hover:border-red-600 hover:text-red-600"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all"
                >
                  <Check size={14} />
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-2 rounded-full border hairline px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all"
                >
                  <X size={14} />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_1.5fr] lg:p-8">
        {/* PRODUCT IMAGE & STATUS */}
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <div
              className="aspect-[4/3] overflow-hidden rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
              style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}
            >
              {!product.image && (
                <div className="grid h-full place-items-center">
                  <Boxes size={32} className="text-[var(--muted)]" />
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <StatusPill value={stockStatus(product)} />
              <p className="text-sm font-semibold">{formatKes(product.retailPrice)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Location</p>
            <p className="mt-3 flex items-center gap-3 text-sm">
              <MapPin size={16} className="text-[var(--muted)]" />
              {product.location}
            </p>
          </div>
        </div>

        {/* STOCK DETAILS */}
        <div className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6">
          <h2 className="text-lg font-medium tracking-[-0.02em]">Stock Details</h2>

          {!editing ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border hairline p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">On Hand</p>
                <p className="mt-2 text-2xl font-medium">{product.onHand}</p>
              </div>
              <div className="rounded-lg border hairline p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Reserved</p>
                <p className="mt-2 text-2xl font-medium">{product.reserved}</p>
              </div>
              <div className="rounded-lg border hairline p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Available</p>
                <p className="mt-2 text-2xl font-medium">{availableStock(product)}</p>
              </div>
              <div className="rounded-lg border hairline p-4">
                <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Incoming</p>
                <p className="mt-2 text-2xl font-medium">{product.incoming}</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">On Hand</label>
                <input
                  type="number"
                  value={editedProduct?.onHand}
                  onChange={(e) => setEditedProduct({ ...editedProduct!, onHand: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[var(--ink)]/10 px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Reserved</label>
                <input
                  type="number"
                  value={editedProduct?.reserved}
                  onChange={(e) => setEditedProduct({ ...editedProduct!, reserved: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[var(--ink)]/10 px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Incoming</label>
                <input
                  type="number"
                  value={editedProduct?.incoming}
                  onChange={(e) => setEditedProduct({ ...editedProduct!, incoming: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[var(--ink)]/10 px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Retail Price</label>
                <input
                  type="number"
                  value={editedProduct?.retailPrice}
                  onChange={(e) => setEditedProduct({ ...editedProduct!, retailPrice: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[var(--ink)]/10 px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]"
                />
              </div>
            </div>
          )}

          <div className="mt-6 border-t hairline pt-4">
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Reorder Point</p>
            <p className="mt-2 text-sm">{product.reorderPoint} units</p>
          </div>
        </div>
      </div>
    </div>
  );
}
