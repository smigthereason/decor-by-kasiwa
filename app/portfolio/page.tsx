import Image from "next/image";
import PageIntro from "@/components/PageIntro";

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

export const metadata = { title: "Portfolio" };

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
        className="page-shell grid gap-px border-b hairline bg-[var(--line)] md:grid-cols-2"
      >
        {projects.map(([name, type, image], index) => (
          <article key={name} className="bg-[var(--canvas)] p-3 md:p-5">
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={image}
                alt={name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>

            <div className="mt-3 flex items-start justify-between border-t hairline pt-3">
              <div>
                <h2 className="text-lg font-medium">{name}</h2>

                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {type}
                </p>
              </div>

              <span className="text-[10px] text-[var(--muted)]">
                0{index + 1}
              </span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
