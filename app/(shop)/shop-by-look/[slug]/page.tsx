import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers3 } from "lucide-react";

import ProductCard from "@/components/root/shop/ProductCard";
import ShopLookAddToCart from "@/components/root/shop/ShopLookAddToCart";
import { formatMoney } from "@/lib/money";
import { getShopLookBySlug } from "@/sanity/lib/catalog";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const look = await getShopLookBySlug(slug);

  if (!look) {
    return { title: "Look not found" };
  }

  const title = look.seoTitle || look.title;
  const description = look.seoDescription || look.description;

  return {
    title,
    description,
    alternates: { canonical: `/shop-by-look/${look.slug}` },
    openGraph: {
      title: `${title} | Decor by Kasiwa`,
      description,
      url: `/shop-by-look/${look.slug}`,
      type: "website",
      images: look.heroImageUrl ? [{ url: look.heroImageUrl, alt: look.title }] : undefined,
    },
  };
}

export default async function ShopLookDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const look = await getShopLookBySlug(slug);

  if (!look) notFound();

  return (
    <main className="bg-[var(--paper)]">
      <section className="grid border-b hairline lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative min-h-[420px] overflow-hidden bg-[var(--warm-beige)] lg:min-h-[680px]">
          {look.heroImageUrl ? (
            <Image
              src={look.heroImageUrl}
              alt={look.title}
              fill
              priority
              unoptimized
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-[var(--deep-green)]">
              <Layers3 size={56} strokeWidth={1} />
            </div>
          )}
        </div>

        <div className="flex items-center bg-[var(--paper-2)] px-5 py-10 sm:px-8 lg:px-12">
          <div className="max-w-xl">
            <Link
              href="/shop-by-look"
              className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" /> All looks
            </Link>
            <p className="kicker mt-10 text-[var(--deep-green)]">{look.eyebrow || "Curated by Decor by Kasiwa"}</p>
            <h1 className="mt-4 text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.9] tracking-[-0.065em]">
              {look.title}
            </h1>
            <p className="mt-6 text-sm leading-7 text-[var(--muted)] sm:text-base">{look.description}</p>

            <div className="mt-7 flex flex-wrap gap-2">
              {look.space?.title && (
                <span className="rounded-full border hairline px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                  {look.space.title}
                </span>
              )}
              {look.style?.title && (
                <span className="rounded-full border hairline px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em]">
                  {look.style.title}
                </span>
              )}
            </div>

            <div className="mt-8 grid grid-cols-3 border-y hairline py-5 text-center">
              <div className="border-r hairline px-2">
                <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Products</p>
                <p className="mt-2 text-lg font-semibold">{look.products.length}</p>
              </div>
              <div className="border-r hairline px-2">
                <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Pieces</p>
                <p className="mt-2 text-lg font-semibold">{look.totalUnits}</p>
              </div>
              <div className="px-2">
                <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Complete look</p>
                <p className="mt-2 text-lg font-semibold">{formatMoney(look.totalPrice)}</p>
              </div>
            </div>

            <div className="mt-8">
              <ShopLookAddToCart
                lines={look.products.map((line) => ({
                  productId: line.product.id,
                  quantity: line.quantity,
                  name: line.product.name,
                }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 max-w-2xl">
            <p className="kicker text-[var(--muted)]">Everything in the look</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Shop the pieces individually</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Open any product for its full description, available finishes and product details.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {look.products.map((line) => (
              <div key={line.id} className="min-w-0">
                <div className="mb-2 flex min-h-8 items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
                  <span>Qty {line.quantity}</span>
                  {line.note && <span className="line-clamp-1 text-right">{line.note}</span>}
                </div>
                <ProductCard product={line.product} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
