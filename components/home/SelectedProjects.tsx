"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const projects = [
  {
    name: "Warm Minimal Residence",
    type: "Residential",
    image:
      "https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=1200&q=88",
  },
  {
    name: "Quiet Luxury Suite",
    type: "Hospitality",
    image:
      "https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=1200&q=88",
  },
  {
    name: "Textured Living Room",
    type: "Styling",
    image:
      "https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1200&q=88",
  },
];

export default function SelectedProjects() {
  return (
    <section className="w-full border-b hairline bg-[var(--canvas)] px-4 py-14 md:px-8 md:py-24">
      <motion.div
        className="mb-10 flex items-end justify-between gap-4"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <div>
          <p className="kicker text-[var(--muted)]">Selected spaces</p>
          <h2 className="mt-4 text-[clamp(2.6rem,6vw,6rem)] font-medium leading-none tracking-[-0.065em]">
            THE PORTFOLIO
          </h2>
        </div>
        <Link href="/portfolio" className="focus-ring editorial-link hidden sm:inline-flex">
          View all <ArrowRight size={13} />
        </Link>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-12">
        {projects.map((project, index) => (
          <motion.article
            key={project.name}
            className={index === 0 ? "md:col-span-6" : "md:col-span-3"}
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.08, duration: 0.6 }}
          >
            <Link href="/portfolio" className="focus-ring group block">
              <div
                className={`relative overflow-hidden ${
                  index === 0 ? "aspect-[4/5]" : "aspect-[3/5]"
                }`}
              >
                <Image
                  src={project.image}
                  alt={project.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
                />
              </div>
              <div className="mt-3 flex justify-between gap-3 border-t hairline pt-3">
                <div>
                  <h3 className="text-sm font-semibold">{project.name}</h3>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                    {project.type}
                  </p>
                </div>
                <span className="text-[10px] text-[var(--muted)]">0{index + 1}</span>
              </div>
            </Link>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
