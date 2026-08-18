import Link from "next/link";

export const metadata = { title: "Returns" };

export default function ReturnsPage() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="border-b hairline px-4 py-14 md:px-8 md:py-20">
        <p className="kicker text-[var(--muted)]">Customer care</p>
        <h1 className="mt-5 text-[clamp(3.6rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">RETURNS.</h1>
        <p className="mt-7 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">Do not publish a generic furniture return promise until the client approves the policy. Standard décor, custom pieces, made-to-measure curtains and installed products may need different rules.</p>
      </div>
      <div className="px-4 py-12 md:px-8 md:py-16">
        <div className="max-w-3xl divide-y hairline border-y hairline">
          {[
            ["Standard stocked products", "Client decision required: return window, product condition, packaging requirements, collection or return shipping costs and refund timeline."],
            ["Custom / bespoke items", "Client decision required: whether custom-made, altered or personalised goods are final sale and what happens when an item is defective."],
            ["Damaged or incorrect items", "Client decision required: reporting period, evidence required, replacement process and collection arrangements."],
          ].map(([title, body]) => <div key={title} className="py-6"><h2 className="text-xl font-medium tracking-[-0.04em]">{title}</h2><p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{body}</p></div>)}
        </div>
        <p className="mt-8 text-sm text-[var(--muted)]">For the prototype journey, return-related links lead here so there are no dead ends. <Link href="/contact" className="text-[var(--ink)] underline underline-offset-4">Contact the studio</Link>.</p>
      </div>
    </section>
  );
}
