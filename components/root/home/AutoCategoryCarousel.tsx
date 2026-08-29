"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export type CategoryCarouselItem = {
  id: string;
  title: string;
  href: string;
  imageUrl?: string | null;
};

export default function AutoCategoryCarousel({ items }: { items: CategoryCarouselItem[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const repeatedItems = useMemo(() => [...items, ...items], [items]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || items.length < 2 || paused) return;

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 40);
      previous = now;
      scroller.scrollLeft += elapsed * 0.025;

      const half = scroller.scrollWidth / 2;
      if (half > 0 && scroller.scrollLeft >= half) {
        scroller.scrollLeft -= half;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [items.length, paused]);

  return (
    <div
      ref={scrollerRef}
      className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => window.setTimeout(() => setPaused(false), 1600)}
      aria-label="Shop by category carousel"
    >
      <div className="flex w-max gap-4 sm:gap-5">
        {repeatedItems.map((item, index) => (
          <Link
            key={`${item.id}-${index}`}
            href={item.href}
            className="group w-[104px] shrink-0 text-center sm:w-[124px] lg:w-[132px]"
            aria-hidden={index >= items.length ? true : undefined}
            tabIndex={index >= items.length ? -1 : undefined}
          >
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full border hairline bg-[var(--paper-2)]">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  unoptimized
                  sizes="132px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">
                  {item.title}
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-snug">{item.title}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
