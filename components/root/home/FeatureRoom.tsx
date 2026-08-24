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
        {collectionRows.map(([number, label, href]) => (
          <Link
            key={label}
            href={href}
            className="group grid min-h-16 grid-cols-[64px_1fr_auto] items-center border-t hairline px-4 text-[11px] uppercase transition-colors hover:bg-[var(--paper-2)] md:grid-cols-[80px_1fr_auto] md:px-6"
          >
            <span className="text-[9px] text-[var(--muted)]">{number}</span>
            <span className="justify-self-center font-semibold underline underline-offset-4">
              {label}
            </span>
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        ))}

        <div className="image-shade relative h-[560px] sm:h-[640px] md:h-[760px] lg:h-[820px]">
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
              priority
              className="object-cover"
            />
          </motion.div>

          <motion.div
            className="absolute inset-x-4 top-5 z-10 text-[var(--white)] md:inset-x-7"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-[clamp(2.4rem,6vw,6rem)] font-medium uppercase leading-none tracking-[-0.055em]">
              Living, considered.
            </h2>
          </motion.div>

          <motion.div
            className="absolute bottom-8 left-4 z-10 max-w-52 text-[var(--white)] sm:max-w-64 md:bottom-12 md:left-12"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.6 }}
          >
            <span className="kicker">The detail</span>
            <p className="mt-3 text-xs leading-relaxed text-soft-cream/80">
              Layered texture, purposeful lighting and furniture selected to
              support how the room is actually lived in.
            </p>
          </motion.div>

          <motion.div
            className="absolute bottom-5 right-4 z-10 w-[min(72vw,18rem)] rounded-lg border border-soft-cream/25 bg-charcoal/20 p-3 text-soft-cream backdrop-blur-lg md:bottom-12 md:right-8 md:w-72"
            initial={{ opacity: 0, x: 28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.65 }}
          >
            <div className="relative h-24 overflow-hidden rounded-md">
              <Image
                src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=700&q=85"
                alt="Interior styling project"
                fill
                className="object-cover"
              />
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-base font-medium">The Residence</p>
                <p className="mt-1 text-[10px] leading-snug text-soft-cream/70">
                  A complete styling and furnishing transformation.
                </p>
              </div>
              <Link
                href="/portfolio"
                className="focus-ring grid size-8 shrink-0 place-items-center rounded-full border border-soft-cream/30 transition-colors hover:bg-soft-cream hover:text-charcoal"
                aria-label="View project"
              >
                <ArrowRight size={13} />
              </Link>
            </div>
          </motion.div>
        </div>


      </div>
    </section>
  );
}
