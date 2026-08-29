"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Boxes, ChevronDown, Search } from "lucide-react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import RestockRequestsPanel from "@/components/backoffice/RestockRequestsPanel";
import StatusPill from "@/components/backoffice/StatusPill";
import { useLiveOperations } from "@/lib/operations/client";
import { formatKes, stockStatus } from "@/lib/operations/selectors";

type Mode = "admin" | "store";

export default function ProductCataloguePage({ mode }: { mode: Mode }) {
  const { data, loading, error, refresh } = useLiveOperations();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const products = data?.products || [];
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((item) => item.category))).sort()],
    [products],
  );

  const filteredProducts = products.filter((item) => {
    if (categoryFilter !== "All" && item.category !== categoryFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return [item.name, item.sku, item.category].some((value) => value.toLowerCase().includes(term));
  });

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={refresh} /></div>;
  }

  const basePath = mode === "admin" ? "/admin/products" : "/store/products";

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Products & inventory</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">
          Live product catalogue
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Admin and Store Manager use the same live Sanity catalogue and can update stock, incoming inventory, reorder levels, prices and shop visibility.
        </p>
      </div>

      <div className="border-b hairline bg-[var(--paper)] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, SKU or category..."
              className="w-full rounded-full border hairline bg-[var(--paper)] py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            />
          </div>
          <div className="relative w-full sm:w-auto sm:min-w-52">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-h-11 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] py-2.5 pl-4 pr-11 text-sm outline-none transition focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            >
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:ml-auto">
            {filteredProducts.length} products
          </span>
        </div>
      </div>

      <section className="space-y-4 p-4 sm:p-6 lg:p-8">
        <RestockRequestsPanel requests={data.restockRequests} onChanged={refresh} />

        {filteredProducts.length === 0 ? (
          <div className="rounded-xl border hairline bg-[var(--paper)] p-12 text-center">
            <Boxes size={32} className="mx-auto text-[var(--muted)]" />
            <p className="mt-4 text-sm font-medium">No products found</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {filteredProducts.map((product) => (
                <article key={product.id} className="min-w-0 rounded-xl border hairline bg-[var(--paper)] p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="size-14 shrink-0 rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
                      style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{product.name}</p>
                          <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{product.sku} · {product.category}</p>
                        </div>
                        <Link
                          href={`${basePath}/${encodeURIComponent(product.id)}`}
                          className="group inline-grid size-9 shrink-0 place-items-center rounded-full border hairline transition hover:border-[var(--deep-green)] hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                          aria-label={`Open ${product.name}`}
                        >
                          <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusPill value={stockStatus(product)} />
                        <span className="text-[10px] text-[var(--muted)]">{product.onHand} on hand</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t hairline pt-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Location</p>
                      <p className="mt-1 truncate text-xs font-medium">{product.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Retail price</p>
                      <p className="mt-1 text-xs font-semibold">{formatKes(product.retailPrice)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border hairline bg-[var(--paper)] md:block">
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b hairline">
                    {["Product", "SKU", "Category", "Stock", "Available", "Price", ""].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="border-b hairline last:border-b-0">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="size-12 shrink-0 rounded-lg border hairline bg-[var(--paper-2)] bg-cover bg-center"
                            style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined}
                          />
                          <div>
                            <p className="text-sm font-semibold">{product.name}</p>
                            <p className="mt-1 text-[10px] text-[var(--muted)]">{product.location}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs">{product.sku}</td>
                      <td className="px-4 py-4 text-xs text-[var(--muted)]">{product.category}</td>
                      <td className="px-4 py-4 text-xs font-semibold">{product.onHand}</td>
                      <td className="px-4 py-4"><StatusPill value={stockStatus(product)} /></td>
                      <td className="px-4 py-4 text-xs font-semibold">{formatKes(product.retailPrice)}</td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`${basePath}/${encodeURIComponent(product.id)}`}
                          className="group inline-grid size-9 place-items-center rounded-full border hairline transition hover:border-[var(--deep-green)] hover:bg-[var(--deep-green)] hover:!text-soft-cream"
                          aria-label={`Open ${product.name}`}
                        >
                          <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
