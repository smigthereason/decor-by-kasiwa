import Link from "next/link";

export const metadata = { title: "FAQs" };

const questions = [
  ["Can I buy products without booking an interior design service?", "Yes. The shop journey is separate from the consultation journey, while individual products can still lead into styling support when a client needs it."],
  ["Can I request something custom?", "The business portfolio includes bespoke furniture, made-to-measure curtains, upholstery, cushions, feature walls and personalised styling. Use the consultation journey to capture the brief."],
  ["Do you work on commercial and hospitality spaces?", "Yes. The business portfolio includes offices, restaurants, retail, hotels, Airbnb and other hospitality or lifestyle spaces."],
  ["What are the delivery and returns rules?", "Those policies must be approved by Decor by Kasiwa before launch. The prototype includes dedicated delivery and returns pages so the final information has a clear home."],
];

export default function FAQPage() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-14 md:px-8 md:py-20">
      <p className="kicker text-[var(--muted)]">Help</p>
      <h1 className="mt-5 text-[clamp(3.6rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">QUESTIONS.</h1>
      <div className="mt-12 max-w-4xl divide-y hairline border-y hairline">
        {questions.map(([question, answer]) => <article key={question} className="grid gap-3 py-6 md:grid-cols-[0.8fr_1.2fr]"><h2 className="font-medium">{question}</h2><p className="text-sm leading-relaxed text-[var(--muted)]">{answer}</p></article>)}
      </div>
      <p className="mt-8 text-sm text-[var(--muted)]">Still need help? <Link href="/contact" className="text-[var(--ink)] underline underline-offset-4">Contact us</Link>.</p>
    </section>
  );
}
