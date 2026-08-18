import PageIntro from "@/components/PageIntro";
import ConsultationForm from "@/components/consultation/ConsultationForm";

export const metadata = { title: "Book a Consultation" };

export default function ConsultationPage() {
  return (
    <>
      <PageIntro
        eyebrow="Start a Project"
        title="Tell us about your space."
        body="A short design discovery journey to help the studio understand what you need before the first conversation."
      />
      <section className="page-shell border-b hairline bg-[var(--paper)] px-4 md:px-8">
        <ConsultationForm />
      </section>
    </>
  );
}
