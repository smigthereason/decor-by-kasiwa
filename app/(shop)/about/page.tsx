import Image from "next/image";
import PageIntro from "@/components/root/PageIntro";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="The Studio"
        title="Design with feeling."
        body="Decor by Kasiwa is an interior design, décor and space transformation studio creating beautiful, functional and personalised environments across residential, commercial and hospitality spaces."
        image="https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=2200&q=92"
        featureImage="https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90"
        index="01"
        meta="Our Studio"
        featureLabel="Our Philosophy"
        featureTitle="Thoughtful interiors, shaped around people."
        ctaLabel="Discover our approach"
        ctaHref="#about-story"
      />

      <section
        id="about-story"
        className="page-shell grid border-b hairline bg-[var(--canvas)] md:grid-cols-2"
      >
        <div className="relative min-h-[520px]">
          <Image
            src="https://images.unsplash.com/photo-1600566753104-685f4f24cb4d?auto=format&fit=crop&w=1200&q=88"
            alt="Interior studio mood"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        <div className="flex flex-col justify-between gap-16 p-5 md:p-10">
          <p className="kicker text-[var(--muted)]">Our philosophy</p>

          <div>
            <p className="text-[clamp(2rem,4vw,4rem)] font-medium leading-[1.02] tracking-[-0.055em]">
              Premium without intimidation. Elegant without becoming formal.
              Creative, practical and personal.
            </p>

            <p className="mt-8 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
              We bring together concept development, styling, sourcing,
              furnishings, bespoke solutions and project execution so each room
              is designed as a complete experience.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
