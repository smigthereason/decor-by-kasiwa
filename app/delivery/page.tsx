import Link from "next/link";

export const metadata = { title: "Delivery" };

export default function DeliveryPage() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="border-b hairline px-4 py-14 md:px-8 md:py-20">
        <p className="kicker text-[var(--muted)]">Customer care</p>
        <h1 className="mt-5 text-[clamp(3.6rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">DELIVERY.</h1>
        <p className="mt-7 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">This page is intentionally a policy placeholder. Decor by Kasiwa still needs to confirm delivery zones, rates, lead times, large-item handling, installation and collection rules before launch.</p>
      </div>
      <div className="grid md:grid-cols-3">
        {[
          ["Small décor", "Define standard parcel delivery areas, fees and estimated lead times."],
          ["Furniture & large items", "Define large-item delivery, room-of-choice delivery, scheduling and assembly or installation options."],
          ["Bespoke / made to order", "Define production lead times, deposits, delivery scheduling and change or cancellation rules."],
        ].map(([title, body]) => <article key={title} className="border-b border-r hairline p-5 md:p-8"><h2 className="text-xl font-medium tracking-[-0.04em]">{title}</h2><p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{body}</p></article>)}
      </div>
      <div className="px-4 py-10 md:px-8"><p className="text-sm text-[var(--muted)]">Need help with a specific piece? <Link href="/consultation" className="text-[var(--ink)] underline underline-offset-4">Speak to the studio</Link>.</p></div>
    </section>
  );
}
