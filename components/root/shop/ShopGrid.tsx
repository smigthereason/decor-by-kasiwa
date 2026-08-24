"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { motion } from "framer-motion";
import { useMemo } from "react";

import {
  formatMoney,
  storeProducts,
} from "@/lib/products";
import ProductCard from "@/components/root/shop/ProductCard";

const categories = [
  "All",
  "Furniture",
  "Lighting",
  "Textiles",
  "Decor",
] as const;

type Category = (typeof categories)[number];

function normalizeCategory(
  value: string | null
): Category {
  if (!value) {
    return "All";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace("décor", "decor");

  const category = categories.find(
    (item) =>
      item.toLowerCase() === normalized
  );

  return category ?? "All";
}

export default function ShopGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = normalizeCategory(
    searchParams.get("category")
  );

  const query = (
    searchParams.get("q") || ""
  )
    .trim()
    .toLowerCase();

  const visible = useMemo(() => {
    return storeProducts.filter(
      (product) => {
        const categoryMatch =
          activeCategory === "All" ||
          product.category
            .trim()
            .toLowerCase() ===
            activeCategory
              .trim()
              .toLowerCase();

        const searchMatch =
          !query ||
          product.name
            .toLowerCase()
            .includes(query) ||
          product.category
            .toLowerCase()
            .includes(query) ||
          product.description
            .toLowerCase()
            .includes(query);

        return (
          categoryMatch &&
          searchMatch
        );
      }
    );
  }, [activeCategory, query]);

  return (
    <section className="w-full">
      {/* CURRENT COLLECTION STATUS */}
      <div className="mb-6 flex items-center justify-between gap-4 border-b hairline pb-6">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Collection
          </span>
          <span className="h-px w-5 bg-[var(--deep-green)]/20" />
          <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[var(--ink)]">
            {activeCategory === "Decor" ? "Décor" : activeCategory}
          </span>
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
          {visible.length} {visible.length === 1 ? "piece" : "pieces"}
        </span>
      </div>

      {/* SEARCH MESSAGE */}
      {query && (
        <div className="mb-6 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper-2)] px-4 py-3 text-xs">
          Showing results for <strong>"{searchParams.get("q")}"</strong>
        </div>
      )}

      {/* PRODUCT GRID - USING PRODUCTCARD COMPONENT */}
      {visible.length > 0 ? (
        <motion.div
          key={`${activeCategory}-${query}`}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {visible.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: Math.min(index * 0.045, 0.3),
              }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        /* EMPTY STATE */
        <div className="grid min-h-80 place-items-center px-4 py-16 text-center">
          <div>
            <p className="kicker text-[var(--muted)]">No pieces found</p>
            <h2 className="mt-3 text-3xl font-medium tracking-[-0.045em]">
              Try another category or search.
            </h2>
            {(activeCategory !== "All" || query) && (
              <button
                type="button"
                onClick={() => {
                  router.push("/shop", { scroll: false });
                }}
                className="focus-ring mt-6 border-[var(--ink)] pb-1 text-[9px] font-semibold uppercase tracking-[0.12em]"
              >
                View all pieces
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
