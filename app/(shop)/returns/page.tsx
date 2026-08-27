import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, Package, AlertCircle } from "lucide-react";
import type { Metadata } from 'next';


export const metadata: Metadata = { title: "Returns" };

export default function ReturnsPage() {
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
          <RotateCcw size={12} strokeWidth={1.5} />
          <span>Customer Care</span>
        </div>
      </div>

      {/* MAIN HEADER */}
      <div className="border-b hairline px-4 py-10 md:px-8 md:py-14 lg:px-12">
        <p className="kicker text-[var(--muted)]">Customer Care</p>
        <h1 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
          Returns
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Do not publish a generic furniture return promise until the client approves the policy. Standard décor, custom pieces, made-to-measure curtains and installed products may need different rules.
        </p>
      </div>

      {/* RETURN POLICIES */}
      <div className="flex-1 px-4 py-8 sm:px-6 md:px-8 lg:px-10 xl:px-12">
        <div className="max-w-4xl">
          <div className="grid grid-cols-1 gap-4 md:gap-6">
            {[
              {
                icon: Package,
                title: "Standard Stocked Products",
                body: "Client decision required: return window, product condition, packaging requirements, collection or return shipping costs and refund timeline.",
              },
              {
                icon: RotateCcw,
                title: "Custom / Bespoke Items",
                body: "Client decision required: whether custom-made, altered or personalised goods are final sale and what happens when an item is defective.",
              },
              {
                icon: AlertCircle,
                title: "Damaged or Incorrect Items",
                body: "Client decision required: reporting period, evidence required, replacement process and collection arrangements.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="flex gap-4 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--muted)]">
                  <item.icon size={16} strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="text-lg font-medium tracking-[-0.03em]">
                    {item.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* CONTACT CTA */}
          <div className="mt-8 flex flex-col gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--muted)]">
              For the prototype journey, return-related links lead here so there are no dead ends.
            </p>
            <Link
              href="/contact"
              className="focus-ring group inline-flex items-center gap-2 self-start rounded-full bg-[var(--deep-green)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <span>Contact the studio</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
