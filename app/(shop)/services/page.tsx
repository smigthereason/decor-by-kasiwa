import PageIntro from "@/components/root/PageIntro";
import { ArrowUpRight } from "lucide-react";

const services = [
  [
    "Interior Design & Styling",
    "Residential interiors, commercial interiors, offices, hospitality, space planning, colour consultation, styling, concepts and mood boards.",
  ],
  [
    "Décor & Furnishings",
    "Curtains, blinds, furniture, rugs, cushions, throws, lighting, mirrors, wall art and statement pieces selected as part of a complete aesthetic.",
  ],
  [
    "Bespoke Décor Solutions",
    "Custom furniture, made-to-measure curtains, upholstery, bespoke cushions, feature walls, colour palettes and personalised styling.",
  ],
  [
    "Space Transformation",
    "Living rooms, bedrooms, dining areas, home offices, entryways, outdoor areas, offices, retail, restaurants, hotels and short-stay properties.",
  ],
  [
    "Sourcing & Procurement",
    "Furniture, décor, fabric, lighting, artwork and accessory sourcing together with supplier, procurement and delivery coordination.",
  ],
  [
    "Project Execution & Installation",
    "Furniture and curtain installation, décor placement, styling, accessorising, final finishing and project coordination.",
  ],
] as const;

export const metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <>
      <PageIntro
        eyebrow="Capabilities"
        title="From concept to completion."
        body="A complete interior service for clients who want one design partner to imagine, design, source, transform and style their space."
        image="https://images.unsplash.com/photo-1600585152915-d208bec867a1?auto=format&fit=crop&w=2200&q=92"
        featureImage="https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90"
        index="02"
        meta="Services"
        featureLabel="Complete Interior Service"
        featureTitle="Design, sourcing, styling and execution in one studio."
        ctaLabel="Explore our services"
        ctaHref="#services-list"
      />

      <section
        id="services-list"
        className="page-shell border-b hairline bg-[var(--paper)] px-4 pb-16 md:px-8 md:pb-24"
      >
        {services.map(([title, body], index) => (
          <article
            key={title}
            className="grid gap-4 border-t hairline py-8 md:grid-cols-[70px_1fr_1fr_auto] md:items-start"
          >
            <span className="text-[10px] text-[var(--muted)]">
              0{index + 1}
            </span>

            <h2 className="text-2xl font-medium tracking-[-0.04em]">
              {title}
            </h2>

            <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              {body}
            </p>

            <ArrowUpRight size={17} />
          </article>
        ))}
      </section>
    </>
  );
}
