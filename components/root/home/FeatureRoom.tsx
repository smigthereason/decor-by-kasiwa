"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const collectionRows = [
  ["001", "Furniture", "/shop?category=Furniture"],
  ["002", "Lighting", "/shop?category=Lighting"],
  ["003", "See all collection", "/shop"],
];

export default function FeatureRoom() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="relative overflow-hidden">
        {/* Collection Navigation Rows */}
        {collectionRows.map(([number, label, href]) => (
          <Link
            key={label}
            href={href}
            className="group grid min-h-[52px] grid-cols-[48px_1fr_48px] items-center border-t hairline px-3 text-[10px] uppercase transition-colors hover:bg-[var(--paper-2)] sm:min-h-16 sm:grid-cols-[64px_1fr_64px] sm:px-4 md:grid-cols-[80px_1fr_80px] md:px-6 md:text-[11px]"
          >
            <span className="text-[8px] text-[var(--muted)] sm:text-[9px]">
              {number}
            </span>
            <span className="text-center font-semibold underline underline-offset-4">
              {label}
            </span>
            <span className="flex justify-end">
              <ArrowRight
                size={12}
                className="transition-transform group-hover:translate-x-1 sm:size-[14px]"
              />
            </span>
          </Link>
        ))}

        {/* Hero Image Container */}
        <div className="image-shade relative h-[480px] xs:h-[520px] sm:h-[560px] md:h-[640px] lg:h-[760px] xl:h-[820px]">
          {/* Background Image */}
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.05 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <Image
              src="https://images.unsplash.com/photo-1617104611622-d5f245d317f0?auto=format&fit=crop&w=2000&q=90"
              alt="Contemporary living room"
              fill
              unoptimized
              priority
              className="object-cover"
            />
          </motion.div>

          {/* Main Heading - Top Left */}
          <motion.div
            className="absolute inset-x-3 top-4 z-10 text-[var(--white)] xs:inset-x-4 xs:top-5 sm:inset-x-4 md:inset-x-7"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-[clamp(1.8rem,10vw,3.2rem)] font-medium uppercase leading-[0.95] tracking-[-0.04em] sm:text-[clamp(2.4rem,6vw,6rem)] sm:tracking-[-0.055em]">
              Living,<br className="xs:hidden" /> considered.
            </h2>
          </motion.div>

          {/* Description - Bottom Left */}
          <motion.div
            className="absolute bottom-6 left-3 z-10 max-w-[200px] text-[var(--white)] xs:left-4 xs:max-w-[200px] sm:max-w-52 md:bottom-12 md:left-8 md:max-w-64 lg:left-12"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.6 }}
          >
            <span className="kicker text-[14px] uppercase tracking-widest xs:text-[10px] sm:text-[11px]">
              The detail
            </span>
            <p className="mt-2 text-[12px] leading-relaxed text-white/80 xs:mt-2.5 xs:text-[11px] sm:mt-3 sm:text-xs">
              Layered texture, purposeful lighting and furniture selected to
              support how the room is actually lived in.
            </p>
          </motion.div>

          {/* Project Card - Bottom Right */}
          <motion.div
            className="absolute hidden sm:block bottom-4 right-3 z-10 w-[min(60vw,14rem)] rounded-lg border border-white/25 bg-black/20 p-2.5 text-white backdrop-blur-lg xs:bottom-5 xs:right-4 xs:w-[min(65vw,16rem)] xs:p-3 sm:w-[min(72vw,18rem)] sm:p-3 md:bottom-12 md:right-6 md:w-72 lg:right-8"
            initial={{ opacity: 0, x: 28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.65 }}
          >
            {/* Card Image */}
            <div className="relative h-20 w-full overflow-hidden rounded-md xs:h-[72px] sm:h-24">
              <Image
                src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=700&q=85"
                alt="Interior styling project"
                fill
                className="object-cover"
              />
            </div>

            {/* Card Content */}
            <div className="mt-2 flex items-end justify-between gap-3 xs:mt-2.5 xs:gap-4 sm:mt-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight xs:text-base sm:text-base">
                  The Residence
                </p>
                <p className="mt-0.5 text-[9px] leading-snug text-white/70 xs:mt-1 xs:text-[10px] sm:text-[10px]">
                  A complete styling and furnishing transformation.
                </p>
              </div>
              <Link
                href="/portfolio"
                className="focus-ring grid size-7 shrink-0 place-items-center rounded-full border border-white/30 transition-colors hover:bg-white hover:text-black xs:size-8 sm:size-8"
                aria-label="View project"
              >
                <ArrowRight size={11} className="xs:size-[13px] sm:size-[13px]" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
