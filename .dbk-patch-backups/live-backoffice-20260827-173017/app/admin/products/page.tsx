"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, X, Check, ImagePlus, Search, Eye, Boxes, MapPin } from "lucide-react";

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

type NewInventoryItem = {
  name: string;
  sku: string;
  category: string;
  finish: string;
  location: string;
  onHand: number;
  reserved: number;
  incoming: number;
  retailPrice: number;
  image: string;
};

const emptyProduct: NewInventoryItem = {
  name: "",
  sku: "",
  category: "Furniture",
  finish: "",
  location: "Main Store",
  onHand: 0,
  reserved: 0,
  incoming: 0,
  retailPrice: 0,
  image: "",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<InventoryItem[]>(initialInventory);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<NewInventoryItem>(emptyProduct);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const nextSkuHint = useMemo(
    () => `KAS-${String(products.length + 1).padStart(3, "0")}`,
    [products.length]
  );

  const filteredProducts = products.filter((item) => {
    if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesName = item.name.toLowerCase().includes(term);
      const matchesSku = item.sku.toLowerCase().includes(term);
      const matchesCategory = item.category.toLowerCase().includes(term);
      if (!matchesName && !matchesSku && !matchesCategory) return false;
    }
    return true;
  });

  function handleUpdateStock<K extends keyof InventoryItem>(
    id: string,
    field: K,
    value: InventoryItem[K]
  ) {
    setProducts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  function handleAddProduct() {
    const timestamp = Date.now();

    const item: InventoryItem = {
      id: `inv-${timestamp}`,
      productId: `admin-${timestamp}`,
      name: newProduct.name.trim() || "Untitled product",
      sku: newProduct.sku.trim() || nextSkuHint,
      category: newProduct.category,
      finish: newProduct.finish.trim(),
      location: newProduct.location.trim() || "Main Store",
      onHand: Number(newProduct.onHand) || 0,
      reserved: Number(newProduct.reserved) || 0,
      incoming: Number(newProduct.incoming) || 0,
      reorderPoint: 3,
      unitCost: 0,
      retailPrice: Number(newProduct.retailPrice) || 0,
      image: newProduct.image.trim() || undefined,
    };

    setProducts((current) => [...current, item]);
    setShowAddForm(false);
    setNewProduct(emptyProduct);
  }

  function handleDeleteProduct(id: string) {
    setProducts((current) => current.filter((item) => item.id !== id));
    if (editingProduct === id) setEditingProduct(null);
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      {/* PAGE HEADER */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 md:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">Inventory</p>
            <h1 className="mt-2 text-2xl font-medium leading-[0.95] tracking-[-0.04em] sm:text-3xl lg:text-4xl">
              Products & Stock.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
              Manage product inventory, stock levels, product images and reorder visibility.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 hover:shadow-lg sm:w-auto"
          >
            <Plus size={14} />
            Add Product
          </button>
        </div>
      </div>

      {/* ADD PRODUCT FORM */}
      {showAddForm && (
        <div className="border-b hairline bg-[var(--paper)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-medium tracking-[-0.03em] sm:text-xl">
                Add New Product
              </h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                <X size={14} /> Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Product Image URL
                </label>
                <div className="flex gap-3">
                  <input
                    placeholder="https://example.com/image.jpg"
                    value={newProduct.image}
                    onChange={(event) =>
                      setNewProduct({ ...newProduct, image: event.target.value })
                    }
                    className="min-w-0 flex-1 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                  />
                  <span
                    className="grid size-12 shrink-0 place-items-center rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)]"
                    aria-hidden="true"
                  >
                    <ImagePlus size={16} />
                  </span>
                </div>

                {newProduct.image && (
                  <div
                    className="mt-3 aspect-[4/3] w-40 overflow-hidden rounded-lg border hairline bg-[var(--paper)] bg-cover bg-center"
                    style={{ backgroundImage: `url("${newProduct.image}")` }}
                    role="img"
                    aria-label="Product image preview"
                  />
                )}
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Product Name
                </label>
                <input
                  placeholder="Product Name"
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, name: event.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  SKU
                </label>
                <input
                  placeholder={nextSkuHint}
                  value={newProduct.sku}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, sku: event.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Category
                </label>
                <select
                  value={newProduct.category}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      category: event.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                >
                  {["Furniture", "Lighting", "Textiles", "Décor"].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Finish
                </label>
                <input
                  placeholder="Finish"
                  value={newProduct.finish}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, finish: event.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Store / Location
                </label>
                <input
                  placeholder="Main Store"
                  value={newProduct.location}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, location: event.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  On Hand
                </label>
                <input
                  type="number"
                  min="0"
                  value={newProduct.onHand}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      onHand: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Incoming
                </label>
                <input
                  type="number"
                  min="0"
                  value={newProduct.incoming}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      incoming: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                  Retail Price (KES)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newProduct.retailPrice}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      retailPrice: Number(event.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--ink)]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddProduct}
              className="group mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3 sm:w-auto"
            >
              <Check size={14} />
              Save Product
            </button>
          </div>
        </div>
      )}

      {/* FILTERS & SEARCH */}
      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {["All", "Furniture", "Lighting", "Textiles", "Décor"].map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={`rounded-full px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all sm:px-4 sm:text-[10px] ${
                  categoryFilter === category
                    ? "bg-[var(--ink)] !text-white"
                    : "border hairline text-[var(--muted)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-2.5 pl-9 pr-4 text-sm outline-none transition-all focus:border-[var(--ink)]"
            />
          </div>
        </div>
      </div>

      {/* MOBILE PRODUCT CARDS */}
      <section className="p-4 sm:p-6 lg:hidden">
        <div className="space-y-3">
          {filteredProducts.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30"
            >
              <div className="flex gap-3">
                {/* Product Image */}
                <div
                  className="size-16 shrink-0 rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
                  style={
                    item.image
                      ? { backgroundImage: `url("${item.image}")` }
                      : undefined
                  }
                >
                  {!item.image && (
                    <div className="grid h-full place-items-center">
                      <ImagePlus size={16} className="text-[var(--muted)]" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${item.id}`}
                    className="text-sm font-semibold hover:underline underline-offset-4"
                  >
                    {item.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{item.sku}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {item.category} · {item.finish || "Standard"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill value={stockStatus(item)} />
                  </div>
                </div>
              </div>

              {/* Stock Info */}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t hairline pt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">On Hand</p>
                  <p className="mt-1 text-sm font-semibold">{item.onHand}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Available</p>
                  <p className="mt-1 text-sm font-semibold">{availableStock(item)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Retail</p>
                  <p className="mt-1 text-sm font-semibold">{formatKes(item.retailPrice)}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex gap-2 border-t hairline pt-3">
                <Link
                  href={`/admin/products/${item.id}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border hairline py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
                >
                  <Eye size={12} />
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => setEditingProduct(item.id)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border hairline py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProduct(item.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border hairline py-2 px-3 text-[9px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-red-600 hover:text-red-600"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* DESKTOP TABLE */}
      <section className="hidden overflow-x-auto p-4 sm:p-6 lg:block lg:p-8">
        <div className="rounded-xl border hairline bg-[var(--paper)]">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead>
              <tr className="border-b hairline bg-[var(--paper-2)]">
                {[
                  "Image",
                  "SKU",
                  "Product",
                  "Location",
                  "On hand",
                  "Reserved",
                  "Available",
                  "Incoming",
                  "Retail",
                  "Status",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] first:pl-5"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((item) => (
                <tr
                  key={item.id}
                  className="border-b hairline transition-colors hover:bg-[var(--paper-2)]/50"
                >
                  <td className="py-4 pl-5 pr-3">
                    <div
                      className="grid size-12 place-items-center overflow-hidden rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
                      style={
                        item.image
                          ? { backgroundImage: `url("${item.image}")` }
                          : undefined
                      }
                    >
                      {!item.image && (
                        <ImagePlus size={16} className="text-[var(--muted)]" />
                      )}
                    </div>
                  </td>
                  <td className="py-4 pr-3 text-sm text-[var(--muted)]">{item.sku}</td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/admin/products/${item.id}`}
                      className="text-sm font-medium hover:underline underline-offset-4"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {item.category} · {item.finish || "Standard"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm">{item.location}</td>
                  <td className="px-4 py-4 text-sm">{item.onHand}</td>
                  <td className="px-4 py-4 text-sm">{item.reserved}</td>
                  <td className="px-4 py-4 text-sm font-semibold">
                    {availableStock(item)}
                  </td>
                  <td className="px-4 py-4 text-sm">{item.incoming}</td>
                  <td className="px-4 py-4 text-sm">{formatKes(item.retailPrice)}</td>
                  <td className="px-4 py-4">
                    <StatusPill value={stockStatus(item)} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/products/${item.id}`}
                        className="grid size-9 place-items-center rounded-full border hairline transition-colors hover:border-[var(--ink)]"
                        aria-label={`View ${item.name}`}
                      >
                        <Eye size={14} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(item.id)}
                        className="grid size-9 place-items-center rounded-full border hairline transition-colors hover:border-[var(--ink)]"
                        aria-label={`Edit ${item.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(item.id)}
                        className="grid size-9 place-items-center rounded-full border hairline transition-colors hover:border-red-600 hover:text-red-600"
                        aria-label={`Delete ${item.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
