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
  const positionRef = useRef(0);
  const resumeTimerRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const repeatedItems = useMemo(() => [...items, ...items], [items]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || items.length < 2 || paused) return;

    let frame = 0;
    let previous: number | null = null;

    // Safari can round fractional scrollLeft writes back to an integer. Keep a
    // separate floating-point position so sub-pixel movement still accumulates.
    positionRef.current = scroller.scrollLeft;

    const tick = (now: number) => {
      if (previous === null) {
        previous = now;
      }

      const elapsed = Math.min(now - previous, 50);
      previous = now;
      positionRef.current += elapsed * 0.035;

      const half = scroller.scrollWidth / 2;
      if (half > 0 && positionRef.current >= half) {
        positionRef.current -= half;
      }

      scroller.scrollLeft = Math.floor(positionRef.current);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [items.length, paused]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

  const pauseForTouch = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
    }
    setPaused(true);
  };

  const resumeAfterTouch = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
    }

    resumeTimerRef.current = window.setTimeout(() => {
      setPaused(false);
      resumeTimerRef.current = null;
    }, 1200);
  };

  return (
    <div
      ref={scrollerRef}
      className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={pauseForTouch}
      onTouchEnd={resumeAfterTouch}
      onTouchCancel={resumeAfterTouch}
      style={{ scrollBehavior: "auto" }}
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
