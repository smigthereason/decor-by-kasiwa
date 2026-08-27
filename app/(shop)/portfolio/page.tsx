import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import PageIntro from "@/components/root/PageIntro";
import type { Metadata } from 'next';


const projects = [
  [
    "Karen Residence",
    "Residential",
    "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=88",
  ],
  [
    "Westlands Studio",
    "Commercial",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=88",
  ],
  [
    "Coastal Stay",
    "Hospitality",
    "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=88",
  ],
  [
    "The Living Room Edit",
    "Before & After",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=88",
  ],
] as const;

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <PageIntro
        eyebrow="Selected Work"
        title="Spaces, transformed."
        body="Residential, commercial, hospitality, bespoke and before-and-after projects presented as the visual proof of the studio's work."
        image="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2200&q=92"
        featureImage="https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=90"
        index="03"
        meta="Portfolio"
        featureLabel="Selected Project"
        featureTitle="Interiors with a point of view."
        ctaLabel="View selected work"
        ctaHref="#portfolio-grid"
      />

      <section
        id="portfolio-grid"
        className="w-full border-t hairline bg-[var(--paper)]"
      >
        {/* PORTFOLIO HEADER */}
        <div className="border-b hairline px-4 py-8 md:px-8 md:py-12 lg:px-12">
          <div className="flex items-center justify-between">
            <p className="kicker text-[var(--muted)]">Selected Projects</p>
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
              {projects.length} Projects
            </span>
          </div>
        </div>

        {/* PROJECT GRID - CARD BASED */}
        <div className="px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10 xl:px-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
            {projects.map(([name, type, image], index) => (
              <article
                key={name}
                className="group flex flex-col overflow-hidden rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--paper-2)]">
                  <Image
                    src={image}
                    alt={name}
                    fill
                    unoptimized
                    priority
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />

                  {/* PROJECT TYPE BADGE */}
                  <span className="absolute left-3 top-3 rounded-full bg-[var(--paper)]/90 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--ink)] backdrop-blur-sm">
                    {type}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-lg font-medium tracking-[-0.02em]">
                      {name}
                    </h2>
                    <span className="shrink-0 text-[10px] text-[var(--muted)]">
                      0{index + 1}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-4">
                    <Link
                      href="/consultation"
                      className="focus-ring group/link inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                    >
                      <span>View project</span>
                      <ArrowRight size={13} className="transition-transform group-hover/link:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
