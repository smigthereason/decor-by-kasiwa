
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

const categories = [
  "All",
  "Furniture",
  "Lighting",
  "Textiles",
  "Decor",
] as const;

type Category = (typeof categories)[number];

/**
 * Converts any incoming category value into the exact category
 * value used by the product data.
 *
 * Examples:
 * furniture -> Furniture
 * FURNITURE -> Furniture
 * Furniture -> Furniture
 * décor -> Decor
 */
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

  /*
   * -------------------------------------------------------------
   * URL IS THE SINGLE SOURCE OF TRUTH
   * -------------------------------------------------------------
   *
   * SiteHeader:
   * /shop?category=Furniture
   *
   * immediately becomes:
   * activeCategory === "Furniture"
   *
   * There is deliberately NO useState for the category.
   */
  const activeCategory = normalizeCategory(
    searchParams.get("category")
  );

  const query = (
    searchParams.get("q") || ""
  )
    .trim()
    .toLowerCase();

  /*
   * -------------------------------------------------------------
   * CATEGORY NAVIGATION
   * -------------------------------------------------------------
   *
   * Updating the URL means both:
   *
   * - SiteHeader
   * - ShopGrid
   *
   * always read exactly the same category.
   */
  function handleCategoryChange(
    category: Category
  ) {
    const params = new URLSearchParams(
      searchParams.toString()
    );

    if (category === "All") {
      params.delete("category");
    } else {
      params.set("category", category);
    }

    const queryString = params.toString();

    router.push(
      queryString
        ? `${pathname}?${queryString}`
        : pathname,
      {
        scroll: false,
      }
    );
  }

  /*
   * -------------------------------------------------------------
   * PRODUCT FILTERING
   * -------------------------------------------------------------
   */
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
    <section className="w-full hairline bg-[var(--paper)]">


      {/* ============================================================ */}
      {/* CURRENT COLLECTION STATUS                                    */}
      {/* ============================================================ */}

      <div
        className="
          flex
          items-center
          justify-between
          gap-4
          hairline
          px-8
          py-8
          md:px-8


        "
      >
        <div className="flex items-center gap-2">
          <span
            className="
              text-[9px]
              uppercase
              tracking-[0.12em]
              text-[var(--muted)]

            "
          >
            Collection
          </span>

          <span
            className="
              h-px
              w-5
              bg-[var(--ink)]/20
            "
          />

          <span
            className="
              text-[9px]
              font-medium
              uppercase
              tracking-[0.12em]
              text-[var(--ink)]
            "
          >
            {activeCategory === "Decor"
              ? "Décor"
              : activeCategory}
          </span>
        </div>

        <span
          className="
            shrink-0
            text-[9px]
            uppercase
            tracking-[0.1em]
            text-[var(--muted)]
          "
        >
          {visible.length}{" "}
          {visible.length === 1
            ? "piece"
            : "pieces"}
        </span>
      </div>

      {/* ============================================================ */}
      {/* SEARCH MESSAGE                                               */}
      {/* ============================================================ */}

      {query && (
        <div
          className="

            hairline
            px-4
            py-4
            text-xs
            md:px-8
          "
        >
          Showing results for{" "}
          <strong>
            “
            {searchParams.get("q")}
            ”
          </strong>
        </div>
      )}

      {/* ============================================================ */}
      {/* PRODUCT GRID                                                 */}
      {/* ============================================================ */}

      {visible.length > 0 ? (
        <motion.div
          key={`${activeCategory}-${query}`}
          className="
            grid
            gap-2
            p-2
            sm:grid-cols-2
            lg:grid-cols-4
          "
          initial={
            {
              opacity: 0,
            }
          }
          animate={
            {
              opacity: 1,
            }
          }
          transition={{
            duration: 0.25,
          }}
        >
          {visible.map(
            (product, index) => (
              <motion.article
                key={product.id}
                className="
                  border
                  border-[var(--ink)]/10

                  p-3
                "
                initial={{
                  opacity: 0,
                  y: 14,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: 0.35,
                  delay:
                    Math.min(
                      index * 0.045,
                      0.3
                    ),
                }}
              >
                <Link
                  href={`/shop/${product.slug}`}
                  className="
                    focus-ring
                    group
                    block
                    w-full
                    text-left
                  "
                >
                  {/* ================================================ */}
                  {/* PRODUCT IMAGE                                    */}
                  {/* ================================================ */}

                  <div
                    className="
                      relative
                      aspect-[3/4]
                      overflow-hidden
                      bg-[var(--paper-2)]
                    "
                  >
                    <Image
                      src={
                        product.heroImage
                      }
                      alt={product.name}
                      fill
                      sizes="
                        (max-width: 640px) 100vw,
                        (max-width: 1024px) 50vw,
                        25vw
                      "
                      className="
                        object-cover
                        transition-transform
                        duration-700
                        ease-out
                        group-hover:scale-[1.035]
                      "
                    />

                    <span
                      className="
                        absolute
                        bottom-3
                        left-3
                        rounded-full
                        bg-[var(--paper)]/90
                        px-3
                        py-1
                        text-[9px]
                        uppercase
                        tracking-[0.08em]
                        backdrop-blur-sm
                        transition-transform
                        duration-300
                        group-hover:translate-x-0.5
                      "
                    >
                      View piece
                    </span>
                  </div>

                  {/* ================================================ */}
                  {/* PRODUCT DETAILS                                  */}
                  {/* ================================================ */}

                  <div className="mt-3">
                    <p
                      className="
                        text-[9px]
                        uppercase
                        tracking-[0.08em]
                        text-[var(--muted)]
                      "
                    >
                      {product.category ===
                      "Decor"
                        ? "Décor"
                        : product.category}
                    </p>

                    <div
                      className="
                        mt-1
                        flex
                        items-start
                        justify-between
                        gap-3
                        text-sm
                      "
                    >
                      <h2
                        className="
                          max-w-[75%]
                          font-medium
                          leading-snug
                        "
                      >
                        {product.name}
                      </h2>

                      <span
                        className="
                          shrink-0
                          whitespace-nowrap
                          text-xs
                        "
                      >
                        {formatMoney(
                          product.price
                        )}
                      </span>
                    </div>


                  </div>
                </Link>
              </motion.article>
            )
          )}
        </motion.div>
      ) : (
        /* ========================================================== */
        /* EMPTY STATE                                                */
        /* ========================================================== */

        <div
          className="
            grid
            min-h-80
            place-items-center
            px-4
            py-16
            text-center
          "
        >
          <div>
            <p className="kicker text-[var(--muted)]">
              No pieces found
            </p>

            <h2
              className="
                mt-3
                text-3xl
                font-medium
                tracking-[-0.045em]
              "
            >
              Try another category or
              search.
            </h2>

            {(activeCategory !==
              "All" ||
              query) && (
              <button
                type="button"
                onClick={() => {
                  router.push(
                    "/shop",
                    {
                      scroll: false,
                    }
                  );
                }}
                className="
                  focus-ring
                  mt-6
                  border-[var(--ink)]
                  pb-1
                  text-[9px]
                  font-semibold
                  uppercase
                  tracking-[0.12em]
                "
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
