"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/money";
import {
  RECENTLY_VIEWED_EVENT,
  readRecentlyViewed,
  type RecentlyViewedProduct,
} from "@/lib/recently-viewed";

export default function RecentlyViewedProducts() {
  const [items, setItems] = useState<RecentlyViewedProduct[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readRecentlyViewed());
    refresh();
    window.addEventListener(RECENTLY_VIEWED_EVENT, refresh);
    return () => window.removeEventListener(RECENTLY_VIEWED_EVENT, refresh);
  }, []);

  if (!items.length) return null;

  return (
    <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
      <div className="mb-4 flex items-end justify-between gap-4 sm:mb-7">
        <div>
          <p className="kicker text-[var(--muted)]">Your browsing history</p>
          <h2 className="mt-1.5 text-[clamp(1.35rem,4vw,2.8rem)] font-semibold tracking-[-0.045em] sm:mt-2">
            Recently viewed
          </h2>
        </div>
        <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] sm:flex">
          <Clock3 size={13} /> Stored on this device
        </div>
      </div>

      <div className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-3 sm:gap-4 lg:gap-5">
          {items.map((item) => (
            <Link
              key={item.productId}
              href={`/shop/${encodeURIComponent(item.slug)}`}
              className="group w-[38vw] min-w-[132px] max-w-[156px] shrink-0 overflow-hidden rounded-xl border hairline bg-[var(--paper)] sm:w-[200px] sm:max-w-[200px] lg:w-[240px] lg:max-w-[240px]"
            >
              <div className="relative aspect-square overflow-hidden bg-[var(--paper-2)]">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 156px, (max-width: 1024px) 200px, 240px"
                    className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.025]"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-3 text-center text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    Product image unavailable
                  </div>
                )}
              </div>
              <div className="p-3 sm:p-4">
                <p className="line-clamp-2 text-xs font-medium leading-snug sm:text-sm">{item.name}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold">{formatMoney(item.price)}</span>
                  {typeof item.retailPrice === "number" && item.retailPrice > item.price ? (
                    <span className="text-[9px] text-[var(--muted)] line-through">{formatMoney(item.retailPrice)}</span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
