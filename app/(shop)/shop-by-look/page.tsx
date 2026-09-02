import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";

import { formatMoney } from "@/lib/money";
import { getShopLooks } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop the Look",
  description:
    "Shop curated Decor by Kasiwa room edits and buy the complete look or individual home décor pieces.",
  alternates: { canonical: "/shop-by-look" },
  openGraph: {
    title: "Shop the Look | Decor by Kasiwa",
    description:
      "Discover coordinated room edits and shop every Decor by Kasiwa piece used in the look.",
    url: "/shop-by-look",
    type: "website",
  },
};

export default async function ShopByLookPage() {
  const looks = await getShopLooks();
  const featured = looks.find((look) => look.featured) || looks[0];
  const remaining = featured ? looks.filter((look) => look.id !== featured.id) : looks;

  return (
    <main className="bg-[var(--paper)]">
      <section className="border-b hairline px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 text-[var(--deep-green)]">
              <Layers3 size={22} strokeWidth={1.35} />
              <p className="kicker">Curated room edits</p>
            </div>
            <h1 className="mt-5 text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
              Shop the Look.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-[var(--muted)] sm:text-base">
              Start with a complete Decor by Kasiwa room edit, then buy the full look or choose only the pieces that work for your space.
            </p>
          </div>
        </div>
      </section>

      {featured ? (
        <>
          <section className="border-b hairline px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
            <Link
              href={`/shop-by-look/${featured.slug}`}
              className="group mx-auto grid max-w-7xl overflow-hidden rounded-2xl border hairline bg-[var(--paper-2)] lg:grid-cols-[1.2fr_0.8fr]"
            >
              <div className="relative min-h-[360px] overflow-hidden bg-[var(--warm-beige)] sm:min-h-[480px]">
                {featured.heroImageUrl ? (
                  <Image
                    src={featured.heroImageUrl}
                    alt={featured.title}
                    fill
                    priority
                    unoptimized
                    sizes="(max-width: 1024px) 100vw, 65vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-[var(--deep-green)]">
                    <Layers3 size={46} strokeWidth={1} />
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center p-6 sm:p-9 lg:p-12">
                <p className="kicker text-[var(--deep-green)]">{featured.eyebrow || "Featured look"}</p>
                <h2 className="mt-3 text-[clamp(2.2rem,5vw,4.2rem)] font-semibold leading-[0.95] tracking-[-0.055em]">
                  {featured.title}
                </h2>
                <p className="mt-5 text-sm leading-7 text-[var(--muted)]">{featured.description}</p>
                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 border-t hairline pt-5 text-xs">
                  <span>{featured.products.length} products</span>
                  <span>{featured.totalUnits} total pieces</span>
                  <span className="font-semibold">{formatMoney(featured.totalPrice)}</span>
                </div>
                <span className="mt-8 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
                  Shop this look <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </section>

          {remaining.length > 0 && (
            <section className="px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
              <div className="mx-auto max-w-7xl">
                <div className="mb-7">
                  <p className="kicker text-[var(--muted)]">More inspiration</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Explore the looks</h2>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {remaining.map((look) => (
                    <Link
                      key={look.id}
                      href={`/shop-by-look/${look.slug}`}
                      className="group overflow-hidden rounded-xl border hairline bg-[var(--paper)]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--paper-2)]">
                        {look.heroImageUrl ? (
                          <Image
                            src={look.heroImageUrl}
                            alt={look.title}
                            fill
                            unoptimized
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center text-[var(--deep-green)]">
                            <Layers3 size={34} strokeWidth={1} />
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                              {[look.space?.title, look.style?.title].filter(Boolean).join(" · ") || "Curated look"}
                            </p>
                            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{look.title}</h3>
                          </div>
                          <ArrowRight size={15} className="mt-1 shrink-0 transition-transform group-hover:translate-x-1" />
                        </div>
                        <div className="mt-5 flex items-center justify-between border-t hairline pt-4 text-xs text-[var(--muted)]">
                          <span>{look.products.length} products</span>
                          <span className="font-semibold text-[var(--ink)]">{formatMoney(look.totalPrice)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="px-4 py-16 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl rounded-2xl border hairline bg-[var(--paper-2)] p-8 text-center sm:p-12">
            <Layers3 size={34} strokeWidth={1.25} className="mx-auto text-[var(--deep-green)]" />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Our first looks are being curated.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--muted)]">
              Check back shortly, or continue shopping the full Decor by Kasiwa catalogue.
            </p>
            <Link
              href="/shop"
              className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
            >
              Continue shopping <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
