"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, ImagePlus } from "lucide-react";

import PageHeading from "@/components/backoffice/PageHeading";
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

  const nextSkuHint = useMemo(
    () => `KAS-${String(products.length + 1).padStart(3, "0")}`,
    [products.length]
  );

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
    <>
      <PageHeading
        eyebrow="Products & Stock"
        title="What we sell. What we have."
        body="Manage product inventory, stock levels, product images and reorder visibility from one place."
        actions={
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="focus-ring group inline-flex min-h-12 items-center gap-3 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-4 hover:shadow-lg"
          >
            <Plus size={14} />
            Add Product
          </button>
        }
      />

      {showAddForm && (
        <div className="border-b hairline bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-medium tracking-[-0.03em]">
                Add New Product
              </h2>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="focus-ring inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
              >
                <X size={14} /> Close
              </button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
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

              <AdminField label="Product Name">
                <input
                  placeholder="Product Name"
                  value={newProduct.name}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, name: event.target.value })
                  }
                />
              </AdminField>

              <AdminField label="SKU">
                <input
                  placeholder={nextSkuHint}
                  value={newProduct.sku}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, sku: event.target.value })
                  }
                />
              </AdminField>

              <AdminField label="Category">
                <select
                  value={newProduct.category}
                  onChange={(event) =>
                    setNewProduct({
                      ...newProduct,
                      category: event.target.value,
                    })
                  }
                >
                  {["Furniture", "Lighting", "Textiles", "Décor"].map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </AdminField>

              <AdminField label="Finish">
                <input
                  placeholder="Finish"
                  value={newProduct.finish}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, finish: event.target.value })
                  }
                />
              </AdminField>

              <AdminField label="Store / Location">
                <input
                  placeholder="Main Store"
                  value={newProduct.location}
                  onChange={(event) =>
                    setNewProduct({ ...newProduct, location: event.target.value })
                  }
                />
              </AdminField>

              <AdminField label="On Hand">
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
                />
              </AdminField>

              <AdminField label="Incoming">
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
                />
              </AdminField>

              <AdminField label="Retail Price (KES)">
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
                />
              </AdminField>
            </div>

            <button
              type="button"
              onClick={handleAddProduct}
              className="focus-ring group mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <Check size={14} />
              Save Product
            </button>
          </div>
        </div>
      )}

      <section className="overflow-x-auto p-4 sm:p-6 lg:p-8">
        <div className="rounded-lg border hairline bg-[var(--paper)]">
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
              {products.map((item) => (
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
                      role={item.image ? "img" : undefined}
                      aria-label={item.image ? `${item.name} product image` : undefined}
                    >
                      {!item.image && (
                        <ImagePlus size={16} className="text-[var(--muted)]" />
                      )}
                    </div>
                  </td>

                  {editingProduct === item.id ? (
                    <>
                      <td className="py-4 pr-3">
                        <TableInput
                          value={item.sku}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "sku", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4">
                        <TableInput
                          value={item.name}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "name", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4">
                        <TableInput
                          value={item.location}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "location", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4">
                        <TableNumberInput
                          value={item.onHand}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "onHand", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4">
                        <TableNumberInput
                          value={item.reserved}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "reserved", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold">
                        {availableStock(item)}
                      </td>
                      <td className="px-4 py-4">
                        <TableNumberInput
                          value={item.incoming}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "incoming", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4">
                        <TableNumberInput
                          value={item.retailPrice}
                          onChange={(value) =>
                            handleUpdateStock(item.id, "retailPrice", value)
                          }
                          wide
                        />
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill value={stockStatus(item)} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(null)}
                            className="focus-ring grid size-9 place-items-center rounded-full bg-[var(--deep-green)] text-soft-cream"
                            aria-label={`Save changes to ${item.name}`}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProduct(null)}
                            className="focus-ring grid size-9 place-items-center rounded-full border hairline"
                            aria-label="Cancel editing"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-4 pr-3 text-sm text-[var(--muted)]">
                        {item.sku}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium">{item.name}</p>
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
                      <td className="px-4 py-4 text-sm">
                        {formatKes(item.retailPrice)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill value={stockStatus(item)} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(item.id)}
                            className="focus-ring grid size-9 place-items-center rounded-full border hairline transition-colors hover:border-[var(--ink)]"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(item.id)}
                            className="focus-ring grid size-9 place-items-center rounded-full border hairline transition-colors hover:border-red-600 hover:text-red-600"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AdminField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </span>
      <div className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--ink)]/10 [&_input]:bg-[var(--paper)] [&_input]:px-4 [&_input]:py-3 [&_input]:text-sm [&_input]:outline-none [&_input]:focus:border-[var(--ink)] [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[var(--ink)]/10 [&_select]:bg-[var(--paper)] [&_select]:px-4 [&_select]:py-3 [&_select]:text-sm [&_select]:outline-none [&_select]:focus:border-[var(--ink)]">
        {children}
      </div>
    </label>
  );
}

function TableInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]"
    />
  );
}

function TableNumberInput({
  value,
  onChange,
  wide = false,
}: {
  value: number;
  onChange: (value: number) => void;
  wide?: boolean;
}) {
  return (
    <input
      type="number"
      min="0"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className={`${wide ? "w-28" : "w-24"} rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] px-3 py-2.5 text-sm outline-none focus:border-[var(--ink)]`}
    />
  );
}
