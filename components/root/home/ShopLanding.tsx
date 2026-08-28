import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";

import ProductCard from "@/components/root/shop/ProductCard";
import type { ShopCategory, ShopNavigation, StoreProduct } from "@/types/commerce";
import type { PublicSiteSettings } from "@/sanity/lib/siteSettings";

const trustItems = [
  { Icon: BadgeCheck, title: "Curated value", description: "Beautiful pieces selected with everyday homes in mind." },
  { Icon: ShieldCheck, title: "Quality first", description: "A considered catalogue with clear product details." },
  { Icon: PackageCheck, title: "Delivery support", description: "Simple fulfilment information for orders across Kenya." },
  { Icon: CreditCard, title: "Secure checkout", description: "Payments are completed through the secure checkout flow." },
] as const;

function productsForCategory(products: StoreProduct[], category: ShopCategory) {
  return products.filter(
    (product) =>
      product.categorySlug === category.slug ||
      product.categoryParent?.slug === category.slug ||
      product.categories?.some((item) => item.slug === category.slug),
  );
}

function ProductRail({ products }: { products: StoreProduct[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex w-max gap-3 sm:gap-4 lg:gap-5">
        {products.map((product) => (
          <div
            key={product.id}
            className="w-[72vw] max-w-[280px] shrink-0 sm:w-[300px] lg:w-[310px]"
          >
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
}: {
  eyebrow?: string;
  title: string;
  href: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-5 sm:mb-7">
      <div>
        {eyebrow && <p className="kicker text-[var(--muted)]">{eyebrow}</p>}
        <h2 className="mt-2 text-[clamp(1.7rem,4vw,2.8rem)] font-semibold tracking-[-0.045em]">
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="focus-ring inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] hover:text-[var(--ink)]"
      >
        View all <ArrowRight size={13} />
      </Link>
    </div>
  );
}

export default function ShopLanding({
  products,
  navigation,
  settings,
}: {
  products: StoreProduct[];
  navigation: ShopNavigation;
  settings?: PublicSiteSettings;
}) {
  const availableProducts = products.filter((product) => product.available !== false);
  const featured =
    availableProducts.find((product) => product.featured && product.heroImage) ||
    availableProducts.find((product) => product.heroImage) ||
    availableProducts[0];

  const bestSellers = availableProducts.filter((product) => product.bestSeller);
  const bestSellerRail = (bestSellers.length ? bestSellers : availableProducts).slice(0, 10);

  const newArrivals = availableProducts.filter((product) => product.newArrival);
  const newArrivalRail = (newArrivals.length ? newArrivals : [...availableProducts].reverse()).slice(0, 10);

  const heroEyebrow = settings?.homeHeroEyebrow?.trim() || "Beautiful home décor for Kenya";
  const heroTitle = settings?.homeHeroTitle?.trim() || "Beautiful homes don't have to cost a fortune.";
  const heroBody = settings?.homeHeroBody?.trim() || "Shop curated décor, greenery, mirrors, lighting and finishing pieces in a simpler, faster shopping experience.";
  const heroCtaLabel = settings?.homeHeroCtaLabel?.trim() || "Shop now";
  const heroImage = settings?.homeHeroImageUrl || featured?.heroImage;

  const categorySections = navigation.categories
    .map((category) => ({
      category,
      products: productsForCategory(availableProducts, category).slice(0, 10),
    }))
    .filter((section) => section.products.length > 0)
    .slice(0, 8);

  return (
    <div className="bg-[var(--paper)]">
      <section className="border-b hairline">
        <div className="grid min-h-[520px] lg:grid-cols-[0.82fr_1.18fr] lg:min-h-[650px]">
          <div className="flex items-center bg-[var(--paper-2)] px-5 py-14 sm:px-8 lg:px-12 xl:px-16">
            <div className="max-w-xl">
              <p className="kicker text-[var(--deep-green)]">{heroEyebrow}</p>
              <h1 className="mt-5 text-[clamp(3.2rem,7vw,6.6rem)] font-semibold leading-[0.9] tracking-[-0.07em] text-[var(--ink)]">
                {heroTitle}
              </h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-[var(--muted)] sm:text-base">
                {heroBody}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/shop"
                  className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
                >
                  {heroCtaLabel} <ArrowRight size={14} />
                </Link>
                <Link
                  href="#shop-by-category"
                  className="focus-ring inline-flex min-h-12 items-center rounded-full border hairline px-6 text-[11px] font-semibold uppercase tracking-[0.08em]"
                >
                  Browse categories
                </Link>
              </div>
            </div>
          </div>

          <div className="relative min-h-[360px] overflow-hidden bg-[var(--warm-beige)] lg:min-h-full">
            {heroImage ? (
              <Image
                src={heroImage}
                alt={featured ? `${featured.name} from Decor by Kasiwa` : "Decor by Kasiwa home décor collection"}
                fill
                priority
                unoptimized
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center px-8 text-center text-[var(--deep-green)]">
                <p className="max-w-md text-3xl font-medium tracking-[-0.04em]">Curated pieces for considered Kenyan homes.</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--charcoal)]/30 via-transparent to-transparent" />
            {featured && (
              <Link
                href={`/shop/${featured.slug}`}
                className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-4 rounded-xl bg-[var(--soft-cream)]/95 p-4 backdrop-blur sm:left-7 sm:right-auto sm:min-w-[320px]"
              >
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Featured piece</p>
                  <p className="mt-1 text-sm font-semibold">{featured.name}</p>
                </div>
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid border-b hairline sm:grid-cols-2 lg:grid-cols-4">
        {trustItems.map(({ Icon, title, description }) => (
          <div key={title} className="flex gap-3 border-b hairline p-5 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
            <Icon size={20} strokeWidth={1.5} className="shrink-0 text-[var(--deep-green)]" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em]">{title}</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p>
            </div>
          </div>
        ))}
      </section>

      <section id="shop-by-category" className="border-b hairline px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
        <SectionHeading title="Shop by category" href="/shop" />
        <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div className="flex w-max gap-4 sm:gap-5">
            {navigation.categories.map((category) => {
              const categoryProducts = productsForCategory(availableProducts, category);
              const image = category.imageUrl || categoryProducts.find((product) => product.heroImage)?.heroImage;
              return (
                <Link
                  key={category.id}
                  href={`/shop?category=${encodeURIComponent(category.slug)}`}
                  className="group w-[112px] shrink-0 text-center sm:w-[132px]"
                >
                  <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full border hairline bg-[var(--paper-2)]">
                    {image ? (
                      <Image
                        src={image}
                        alt={category.title}
                        fill
                        unoptimized
                        sizes="132px"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">
                        {category.title}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-[11px] font-semibold leading-snug">{category.title}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {bestSellerRail.length > 0 && (
        <section className="border-b hairline px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
          <SectionHeading eyebrow="Popular right now" title="Best sellers" href="/shop?collection=best-sellers" />
          <ProductRail products={bestSellerRail} />
        </section>
      )}

      {categorySections.map(({ category, products: categoryProducts }) => (
        <section key={category.id} className="border-b hairline px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
          <SectionHeading
            eyebrow="Shop the collection"
            title={category.title}
            href={`/shop?category=${encodeURIComponent(category.slug)}`}
          />
          <ProductRail products={categoryProducts} />
        </section>
      ))}

      {newArrivalRail.length > 0 && (
        <section className="border-b hairline bg-[var(--paper-2)] px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
          <SectionHeading eyebrow="Fresh for the home" title="New arrivals" href="/shop?collection=new-arrivals" />
          <ProductRail products={newArrivalRail} />
        </section>
      )}

      <section className="grid border-b hairline sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Under KES 500", "under-500"],
          ["KES 500–1,000", "500-1000"],
          ["KES 1,000–2,500", "1000-2500"],
          ["KES 2,500–5,000", "2500-5000"],
          ["Above KES 5,000", "above-5000"],
        ].map(([label, value]) => (
          <Link
            key={value}
            href={`/shop?price=${value}`}
            className="group flex min-h-24 items-center justify-between border-b hairline px-5 py-5 sm:border-r lg:border-b-0 lg:last:border-r-0"
          >
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Shop by price</p>
              <p className="mt-2 text-sm font-semibold">{label}</p>
            </div>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
          </Link>
        ))}
      </section>
    </div>
  );
}
