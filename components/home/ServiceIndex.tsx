"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const services = [
  ["01", "Interior Design", "Residential, commercial and hospitality interiors"],
  ["02", "Interior Styling", "Layering, finishing, art, accessories and composition"],
  ["03", "Bespoke Solutions", "Custom furniture, upholstery and made-to-measure details"],
  ["04", "Sourcing & Procurement", "Furniture, lighting, fabrics, art and supplier coordination"],
  ["05", "Space Transformation", "From focused room refreshes to complete transformations"],
  ["06", "Project Execution", "Installation, placement, finishing and final styling"],
];

export default function ServiceIndex() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-14 md:px-8 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65 }}
        >
          <p className="kicker text-[var(--muted)]">What we do</p>
          <h2 className="mt-4 max-w-sm text-[clamp(2.8rem,6vw,6rem)] font-medium leading-[0.92] tracking-[-0.065em]">
            FROM IDEA
            <br />
            TO REVEAL.
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            One studio coordinating design, sourcing, furnishing and execution
            so the finished space feels coherent rather than assembled.
          </p>
        </motion.div>

        <div>
          {services.map(([number, title, description], index) => {
            const isLast = index === services.length - 1;

            return (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ delay: index * 0.055, duration: 0.5 }}
              >
                <Link
                  href="/services"
                  className={`group grid gap-3 hairline py-5 transition-colors hover:bg-[var(--paper-2)] md:grid-cols-[54px_1fr_1fr_auto] md:items-center md:px-2 ${
                    !isLast ? 'border-b' : ''
                  }`}
                >
                  <span className="text-[10px] text-[var(--muted)]">{number}</span>
                  <span className="text-lg font-medium tracking-[-0.03em] md:text-xl">
                    {title}
                  </span>
                  <span className="max-w-sm text-xs leading-relaxed text-[var(--muted)]">
                    {description}
                  </span>
                  <ArrowUpRight
                    size={16}
                    className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                  />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
