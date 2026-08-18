"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { formatMoney, storeProducts } from "@/lib/products";

const categories = ["All", "Furniture", "Lighting", "Textiles", "Decor"];

export default function ShopGrid() {
  const searchParams = useSearchParams();
  const queryCategory = searchParams.get("category");
  const query = (searchParams.get("q") || "").trim().toLowerCase();

  const [activeCategory, setActiveCategory] = useState(
    queryCategory && categories.includes(queryCategory) ? queryCategory : "All"
  );

  const visible = useMemo(() => {
    return storeProducts.filter((product) => {
      const categoryMatch =
        activeCategory === "All" || product.category === activeCategory;
      const searchMatch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query);
      return categoryMatch && searchMatch;
    });
  }, [activeCategory, query]);

  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="flex gap-3 overflow-x-auto border-b hairline px-4 py-4 md:px-8">
        {categories.map((item) => (
          <button
            key={item}
            onClick={() => setActiveCategory(item)}
            className={`focus-ring whitespace-nowrap rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.08em] transition-colors ${
              activeCategory === item
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                : "hairline hover:bg-[var(--paper-2)]"
            }`}
          >
            {item === "Decor" ? "Décor" : item}
          </button>
        ))}
      </div>

      {query && (
        <div className="border-b hairline px-4 py-4 text-xs md:px-8">
          Showing results for <strong>“{searchParams.get("q")}”</strong>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((product, index) => (
            <motion.article
              key={product.id}
              className="border-b border-r hairline p-3"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.055 }}
            >
              <Link
                href={`/shop/${product.slug}`}
                className="focus-ring group block w-full text-left"
              >
                <div className="relative aspect-[3/4] overflow-hidden bg-[var(--paper-2)]">
                  <Image
                    src={product.heroImage}
                    alt={product.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-[var(--paper)]/90 px-3 py-1 text-[9px] uppercase tracking-[0.08em] backdrop-blur-sm">
                    View piece
                  </span>
                </div>
                <div className="mt-3">
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    {product.category}
                  </p>
                  <div className="mt-1 flex justify-between gap-3 text-sm">
                    <h2 className="font-medium">{product.name}</h2>
                    <span className="whitespace-nowrap text-xs">
                      {formatMoney(product.price)}
                    </span>
                  </div>
                  {product.demoPrice && (
                    <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      Prototype pricing
                    </p>
                  )}
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-80 place-items-center px-4 py-16 text-center">
          <div>
            <p className="kicker text-[var(--muted)]">No pieces found</p>
            <h2 className="mt-3 text-3xl font-medium tracking-[-0.045em]">
              Try another category or search.
            </h2>
          </div>
        </div>
      )}
    </section>
  );
}
