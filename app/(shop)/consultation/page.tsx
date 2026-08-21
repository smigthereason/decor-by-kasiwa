import PageIntro from "@/components/root/PageIntro";
import ConsultationForm from "@/components/root/consultation/ConsultationForm";

export const metadata = { title: "Book a Consultation" };

export default function ConsultationPage() {
  return (
    <>
      <PageIntro
        eyebrow="Start a Project"
        title="Tell us about your space."
        body="A short design discovery journey to help the studio understand what you need before the first conversation."
        image="https://images.unsplash.com/photo-1600566753051-f0b89df2dd90?auto=format&fit=crop&w=2200&q=92"
        featureImage="https://images.unsplash.com/photo-1600210491369-e753d80a41f3?auto=format&fit=crop&w=1000&q=90"
        index="06"
        meta="Consultation"
        featureLabel="Design Discovery"
        featureTitle="Every project begins with understanding the space."
        ctaLabel="Begin your consultation"
        ctaHref="#consultation-form"
      />

      <section
        id="consultation-form"
        className="page-shell border-b hairline bg-[var(--paper)] px-4 md:px-8"
      >
        <ConsultationForm />
      </section>
    </>
  );
}
