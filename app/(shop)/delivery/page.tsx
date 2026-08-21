import Link from "next/link";
import { ArrowLeft, ArrowRight, Truck, Package, Clock } from "lucide-react";

export const metadata = { title: "Delivery" };

export default function DeliveryPage() {
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
          <Truck size={12} strokeWidth={1.5} />
          <span>Customer Care</span>
        </div>
      </div>

      {/* MAIN HEADER */}
      <div className="border-b hairline px-4 py-10 md:px-8 md:py-14 lg:px-12">
        <p className="kicker text-[var(--muted)]">Customer Care</p>
        <h1 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
          Delivery
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          This page is intentionally a policy placeholder. Decor by Kasiwa still needs to confirm delivery zones, rates, lead times, large-item handling, installation and collection rules before launch.
        </p>
      </div>

      {/* DELIVERY OPTIONS */}
      <div className="flex-1 px-4 py-8 sm:px-6 md:px-8 lg:px-10 xl:px-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {[
            {
              icon: Package,
              title: "Small Décor",
              body: "Define standard parcel delivery areas, fees and estimated lead times.",
            },
            {
              icon: Truck,
              title: "Furniture & Large Items",
              body: "Define large-item delivery, room-of-choice delivery, scheduling and assembly or installation options.",
            },
            {
              icon: Clock,
              title: "Bespoke / Made to Order",
              body: "Define production lead times, deposits, delivery scheduling and change or cancellation rules.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="flex flex-col rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-5 sm:p-6 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
            >
              <span className="grid size-10 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--muted)]">
                <item.icon size={16} strokeWidth={1.5} />
              </span>
              <h2 className="mt-4 text-lg font-medium tracking-[-0.03em]">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                {item.body}
              </p>
            </article>
          ))}
        </div>

        {/* CONTACT CTA */}
        <div className="mt-8 flex flex-col gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--muted)]">
            Need help with a specific piece?
          </p>
          <Link
            href="/consultation"
            className="focus-ring group inline-flex items-center gap-2 self-start rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:gap-3"
          >
            <span>Speak to the studio</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
