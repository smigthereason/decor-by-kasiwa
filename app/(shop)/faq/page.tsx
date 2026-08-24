// app/(shop)/faq/page.tsx
import Link from "next/link";
import { ArrowLeft, ArrowRight, HelpCircle } from "lucide-react";
import FAQItem from "@/components/root/faq/FAQItem";

export const metadata = { title: "FAQs" };

const questions = [
  ["Can I buy products without booking an interior design service?", "Yes. The shop journey is separate from the consultation journey, while individual products can still lead into styling support when a client needs it."],
  ["Can I request something custom?", "The business portfolio includes bespoke furniture, made-to-measure curtains, upholstery, cushions, feature walls and personalised styling. Use the consultation journey to capture the brief."],
  ["Do you work on commercial and hospitality spaces?", "Yes. The business portfolio includes offices, restaurants, retail, hotels, Airbnb and other hospitality or lifestyle spaces."],
  ["What are the delivery and returns rules?", "Those policies must be approved by Decor by Kasiwa before launch. The prototype includes dedicated delivery and returns pages so the final information has a clear home."],
];

export default function FAQPage() {
  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* HEADER BAR */}
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/shop"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
          Back to shop
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <HelpCircle size={12} strokeWidth={1.5} />
          <span>Help Centre</span>
        </div>
      </div>

      {/* MAIN HEADER */}
      <div className="border-b hairline px-4 py-10 md:px-8 md:py-14 lg:px-12">
        <p className="kicker text-[var(--muted)]">Help</p>
        <h1 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
          Questions
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Common questions about our services, products, and process.
        </p>
      </div>

      {/* FAQ LIST */}
      <div className="flex-1 px-4 py-8 sm:px-6 md:px-8 lg:px-10 xl:px-12">
        <div className="max-w-4xl">
          <div className="rounded-lg border hairline bg-[var(--paper)]">
            {questions.map(([question, answer], index) => (
              <FAQItem
                key={question}
                question={question}
                answer={answer}
                isLast={index === questions.length - 1}
              />
            ))}
          </div>

          {/* CONTACT CTA */}
          <div className="mt-8 flex flex-col gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--muted)]">
              Still need help?
            </p>
            <Link
              href="/contact"
              className="focus-ring group inline-flex items-center gap-2 self-start rounded-full bg-[var(--deep-green)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <span>Contact us</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
