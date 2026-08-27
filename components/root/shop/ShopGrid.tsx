"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { ChevronDown } from "lucide-react";

import ProductCard from "@/components/root/shop/ProductCard";
import type { ShopNavigation, StoreProduct } from "@/types/commerce";

const priceOptions = [
  { label: "All prices", value: "" },
  { label: "Under KES 500", value: "under-500" },
  { label: "KES 500 – 1,000", value: "500-1000" },
  { label: "KES 1,000 – 2,500", value: "1000-2500" },
  { label: "KES 2,500 – 5,000", value: "2500-5000" },
  { label: "Above KES 5,000", value: "above-5000" },
];

function matchesPrice(price: number, range: string | null) {
  if (!range) return true;
  if (range === "under-500") return price < 500;
  if (range === "500-1000") return price >= 500 && price <= 1000;
  if (range === "1000-2500") return price > 1000 && price <= 2500;
  if (range === "2500-5000") return price > 2500 && price <= 5000;
  if (range === "above-5000") return price > 5000;
  return true;
}

export default function ShopGrid({ products, navigation }: { products: StoreProduct[]; navigation: ShopNavigation }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = searchParams.get("category");
  const collection = searchParams.get("collection");
  const space = searchParams.get("space");
  const style = searchParams.get("style");
  const price = searchParams.get("price");
  const query = (searchParams.get("q") || "").trim().toLowerCase();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  const categoryLabel = useMemo(() => {
    if (!category) return "All Products";
    for (const item of navigation.categories) {
      if (item.slug === category) return item.title;
      const child = item.children.find((entry) => entry.slug === category);
      if (child) return child.title;
    }
    return category;
  }, [category, navigation.categories]);

  const visible = useMemo(() => products.filter((product) => {
    const categoryMatch = !category || product.categorySlug === category || product.categoryParent?.slug === category || product.categories?.some((item) => item.slug === category) || product.category.trim().toLowerCase() === category.trim().toLowerCase();
    const collectionMatch = !collection || product.collections?.some((item) => item.slug === collection) || (collection === "new-arrivals" && product.newArrival) || (collection === "best-sellers" && product.bestSeller) || (collection === "offers" && product.onSale);
    const spaceMatch = !space || product.spaces?.some((item) => item.slug === space);
    const styleMatch = !style || product.styles?.some((item) => item.slug === style);
    const priceMatch = matchesPrice(product.price, price);
    const searchable = [product.name, product.category, product.categoryParent?.title || "", product.description, product.sku || "", ...(product.materials || []), ...(product.colours || [])].join(" ").toLowerCase();
    return categoryMatch && collectionMatch && spaceMatch && styleMatch && priceMatch && (!query || searchable.includes(query));
  }), [products, category, collection, space, style, price, query]);

  const hasFilters = Boolean(category || collection || space || style || price || query);

  return (
    <section className="w-full">
      <div className="mb-5 overflow-x-auto overscroll-x-contain border-b hairline pb-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center gap-2">
          <Link href="/shop" scroll={false} className={`min-h-10 rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors sm:text-xs ${!category ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream" : "hairline hover:border-[var(--ink)]"}`}>All</Link>
          {navigation.categories.map((item) => (
            <Link key={item.slug} href={`/shop?category=${item.slug}`} scroll={false} className={`min-h-10 rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors sm:text-xs ${category === item.slug ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream" : "hairline hover:border-[var(--ink)]"}`}>{item.title}</Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-4 border-b hairline pb-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Shop by Space */}
        <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
          Shop by Space
          <div className="relative w-full">
            <select
              value={space || ""}
              onChange={(event) => setFilter("space", event.target.value)}
              className="min-h-12 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] pl-5 pr-12 text-sm font-medium leading-5 normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15"
            >
              <option value="">All spaces</option>
              {navigation.spaces.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
          </div>
        </label>

        {/* Shop by Style */}
        <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
          Shop by Style
          <div className="relative w-full">
            <select
              value={style || ""}
              onChange={(event) => setFilter("style", event.target.value)}
              className="min-h-12 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] pl-5 pr-12 text-sm font-medium leading-5 normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15"
            >
              <option value="">All styles</option>
              {navigation.styles.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
          </div>
        </label>

        {/* Shop by Price */}
        <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
          Shop by Price
          <div className="relative w-full">
            <select
              value={price || ""}
              onChange={(event) => setFilter("price", event.target.value)}
              className="min-h-12 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] pl-5 pr-12 text-sm font-medium leading-5 normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15"
            >
              {priceOptions.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
          </div>
        </label>

        {/* Collection */}
        <label className="grid gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">
          Collection
          <div className="relative w-full">
            <select
              value={collection || ""}
              onChange={(event) => setFilter("collection", event.target.value)}
              className="min-h-12 w-full cursor-pointer appearance-none rounded-full border hairline bg-[var(--paper)] pl-5 pr-12 text-sm font-medium leading-5 normal-case tracking-normal text-[var(--ink)] outline-none transition-colors focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/15"
            >
              <option value="">All collections</option>
              {navigation.collections.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            />
          </div>
        </label>
      </div>

      <div className="mb-6 flex items-center justify-between gap-4 border-b hairline pb-6">
        <div className="flex min-w-0 items-center gap-2"><span className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] sm:text-xs">Collection</span><span className="h-px w-5 bg-[var(--deep-green)]/20" /><span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink)] sm:text-xs">{categoryLabel}</span></div>
        <div className="flex shrink-0 items-center gap-4">
          {hasFilters && <button type="button" onClick={() => router.push("/shop", { scroll: false })} className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] underline underline-offset-4 sm:text-xs">Clear filters</button>}
          <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted)] sm:text-xs">{visible.length} {visible.length === 1 ? "piece" : "pieces"}</span>
        </div>
      </div>

      {query && <div className="mb-6 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper-2)] px-4 py-3 text-xs">Showing results for <strong>“{searchParams.get("q")}”</strong></div>}

      {visible.length > 0 ? (
        <motion.div key={`${category}-${collection}-${space}-${style}-${price}-${query}`} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          {visible.map((product, index) => <motion.div key={product.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: Math.min(index * 0.02, 0.25) }}><ProductCard product={product} /></motion.div>)}
        </motion.div>
      ) : (
        <div className="grid min-h-80 place-items-center px-4 py-16 text-center"><div><p className="kicker text-[var(--muted)]">No pieces found</p><h2 className="mt-3 text-3xl font-medium tracking-[-0.045em]">Try another category or filter.</h2>{hasFilters && <button type="button" onClick={() => router.push("/shop", { scroll: false })} className="focus-ring mt-6 border-[var(--ink)] pb-1 text-[9px] font-semibold uppercase tracking-[0.12em]">View all pieces</button>}</div></div>
      )}
    </section>
  );
}
