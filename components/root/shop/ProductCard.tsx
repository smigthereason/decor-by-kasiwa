// components/root/shop/ProductCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StoreProduct } from "@/types/commerce";
import { formatMoney } from "@/lib/money";
import { isProductSoldOut } from "@/lib/catalogue";
import { getProductRating } from "@/lib/product-rating";
import ProductRatingStars from "@/components/root/shop/ProductRatingStars";
import { getQuantityUnitPrice } from "@/lib/product-pricing";

function getColorHex(colourName: string): string {
  const colorMap: Record<string, string> = {
    // Whites & Creams
    "warm ivory": "#F5F0E8",
    "ivory": "#FFFFF0",
    "white": "#FFFFFF",
    "cream": "#FFFDD0",
    "natural": "#E8DCC8",

    // Browns & Woods
    "charcoal": "#36454F",
    "black": "#1A1A1A",
    "deep brown": "#3E2723",
    "taupe": "#8B8589",
    "sand": "#C2B280",
    "olive": "#708238",
    "walnut": "#773F1A",
    "oak": "#D2B48C",
    "teak": "#916B4F",

    // Metals
    "brushed brass": "#C5A059",
    "warm brass": "#B8860B",
    "brass": "#C5A059",
    "copper": "#B87333",
    "bronze": "#CD7F32",

    // Other
    "black metal": "#2C2C2C",
    "grey": "#808080",
    "gray": "#808080",
    "beige": "#F5F5DC",
    "linen": "#FAF0E6",
  };

  return colorMap[colourName.toLowerCase()] || "#CCCCCC";
}

export default function ProductCard({
  product,
  homeCompact = false,
}: {
  product: StoreProduct;
  homeCompact?: boolean;
}) {
  const soldOut = isProductSoldOut(product);
  const { rating, reviewCount } = getProductRating(product);
  const displayColours = Array.from(
    new Set([
      ...(product.colours || []),
      ...(product.variants || []).map((variant) => variant.colour).filter((value): value is string => Boolean(value)),
    ]),
  );

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
    >
      {/* PRODUCT IMAGE */}
      <div
        className={[
          "relative overflow-hidden bg-[var(--paper-2)]",
          homeCompact ? "aspect-square sm:aspect-[4/5]" : "aspect-[4/5]",
        ].join(" ")}
      >
        {product.heroImage ? (
          <Image
            src={product.heroImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            unoptimized
            priority
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[var(--warm-beige)] px-6 text-center">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--deep-green)]">Decor by Kasiwa</p>
              <p className="mt-2 text-xs text-[var(--muted)]">Product image coming soon</p>
            </div>
          </div>
        )}

        {!homeCompact && (
          <>
            {/* CATEGORY + MERCHANDISING BADGES */}
            <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              <span className="rounded-full bg-[var(--paper)]/90 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--ink)] backdrop-blur-sm">
                {product.category === "Decor" ? "Décor" : product.category}
              </span>
              {product.bestSeller && (
                <span className="rounded-full bg-[var(--deep-green)] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] !text-soft-cream shadow-sm">
                  Best seller
                </span>
              )}
            </div>

            {/* QUICK VIEW INDICATOR */}
            <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-[var(--paper)]/90 opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">
              <ArrowRight size={14} className="text-[var(--ink)]" />
            </span>
          </>
        )}

        {homeCompact && product.bestSeller && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--deep-green)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.06em] !text-soft-cream shadow-sm sm:left-3 sm:top-3 sm:px-2.5">
            Best seller
          </span>
        )}

        {soldOut && (
          <span className="absolute bottom-3 left-3 rounded-full bg-[var(--charcoal)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--soft-cream)]">
            Out of stock
          </span>
        )}
      </div>

      {/* PRODUCT DETAILS */}
      <div className={homeCompact ? "flex flex-1 flex-col p-2.5 sm:p-4" : "flex flex-1 flex-col p-4 sm:p-5"}>
        <h3
          className={[
            "font-medium leading-snug tracking-[-0.02em] text-[var(--ink)] group-hover:underline group-hover:underline-offset-4",
            homeCompact ? "line-clamp-2 text-[12px] sm:text-sm" : "text-sm",
          ].join(" ")}
        >
          {product.name}
        </h3>

        <div className={homeCompact ? "mt-1.5 flex items-center gap-1.5" : "mt-2 flex items-center gap-2"} aria-label={`${rating.toFixed(1)} out of 5 stars`}>
          <ProductRatingStars rating={rating} size={homeCompact ? 11 : 13} />
          <span className="text-[11px] font-semibold text-[var(--ink)]">{rating.toFixed(1)}</span>
          {!homeCompact && typeof reviewCount === "number" && (
            <span className="text-[10px] text-[var(--muted)]">({reviewCount})</span>
          )}
        </div>

        {!homeCompact && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
            {product.description}
          </p>
        )}

        <div className={homeCompact ? "mt-auto flex items-center justify-between pt-2" : "mt-auto flex items-center justify-between pt-4"}>
          <span className={homeCompact ? "text-xs font-semibold text-[var(--ink)]" : "text-sm font-semibold text-[var(--ink)]"}>
            {formatMoney(getQuantityUnitPrice(product, 1))}
          </span>

          {!homeCompact && displayColours.length > 0 && (
            <div className="flex items-center gap-1.5">
              {displayColours.slice(0, 3).map((colour) => (
                <span
                  key={colour}
                  className="size-3 rounded-full border border-[var(--ink)]/20"
                  style={{ backgroundColor: getColorHex(colour) }}
                  title={colour}
                />
              ))}
              {displayColours.length > 3 && (
                <span className="text-[9px] text-[var(--muted)]">
                  +{displayColours.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
