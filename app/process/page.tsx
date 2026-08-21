import PageIntro from "@/components/PageIntro";

const steps = [
  [
    "01",
    "Consultation",
    "Understand the space, the people using it, the functional requirements, budget and desired outcome.",
  ],
  [
    "02",
    "Concept",
    "Define the creative direction through references, mood, materials, palette and spatial thinking.",
  ],
  [
    "03",
    "Design",
    "Develop the design into a coherent scheme covering layout, furniture, lighting, finishes and details.",
  ],
  [
    "04",
    "Selection & Sourcing",
    "Select and procure furnishings, fabrics, lighting, art, accessories and bespoke elements.",
  ],
  [
    "05",
    "Installation",
    "Coordinate delivery, installation and placement across the project.",
  ],
  [
    "06",
    "Styling",
    "Layer the finishing touches, accessories, art and objects that bring the space to life.",
  ],
  [
    "07",
    "Final Reveal",
    "Hand over a complete, considered environment rather than a collection of individual purchases.",
  ],
] as const;

export const metadata = { title: "Our Process" };

export default function ProcessPage() {
  return (
    <>
      <PageIntro
        eyebrow="How We Work"
        title="Imagine. Design. Transform."
        body="A structured journey from the first conversation to the final reveal."
        image="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=2200&q=92"
        featureImage="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1000&q=90"
        index="05"
        meta="Our Process"
        featureLabel="From Concept to Completion"
        featureTitle="A complete journey, handled with intention."
        ctaLabel="See how we work"
        ctaHref="#process-steps"
      />

      <section
        id="process-steps"
        className="page-shell border-b hairline bg-[var(--canvas)] px-4 pb-16 md:px-8 md:pb-24"
      >
        {steps.map(([number, title, body]) => (
          <article
            key={number}
            className="grid gap-4 border-t hairline py-7 md:grid-cols-[70px_0.8fr_1fr]"
          >
            <span className="text-[10px] text-[var(--muted)]">{number}</span>

            <h2 className="text-2xl font-medium tracking-[-0.04em]">
              {title}
            </h2>

            <p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              {body}
            </p>
          </article>
        ))}
      </section>
    </>
  );
}
