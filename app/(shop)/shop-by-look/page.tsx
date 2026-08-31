import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop by Look",
  description: "Curated Decor by Kasiwa room looks are coming soon. Shop complete room edits or individual pieces once the collection launches.",
  alternates: { canonical: "/shop-by-look" },
};

export default function ShopByLookPage() {
  return (
    <main className="min-h-[70vh] bg-[var(--paper)] px-4 py-16 sm:px-6 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-4xl rounded-3xl border hairline bg-[var(--paper-2)] p-7 sm:p-10 lg:p-14">
        <Layers3 size={34} strokeWidth={1.25} className="text-[var(--deep-green)]" />
        <p className="kicker mt-8 text-[var(--muted)]">Coming soon</p>
        <h1 className="mt-3 text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.07em]">Shop by Look.</h1>
        <p className="mt-7 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
          We are preparing complete room edits that combine individual products into one coordinated look. Each look will support buying the complete bundle or choosing only the pieces you want.
        </p>
        <Link href="/shop" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">
          Continue shopping <ArrowRight size={14} />
        </Link>
      </div>
    </main>
  );
}
