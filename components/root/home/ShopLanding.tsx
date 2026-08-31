"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  PackageCheck,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";

import AutoCategoryCarousel, {
  type CategoryCarouselItem,
} from "@/components/root/home/AutoCategoryCarousel";
import ProductCard from "@/components/root/shop/ProductCard";
import type { ShopCategory, ShopLook, ShopNavigation, StoreProduct } from "@/types/commerce";
import type { PublicSiteSettings } from "@/sanity/lib/siteSettings";
import { formatMoney } from "@/lib/money";

const trustItems = [
  { Icon: BadgeCheck, title: "Curated value", description: "Beautiful pieces selected with everyday spaces in mind." },
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

interface CarouselProps {
  children: React.ReactNode;
  itemWidth?: number;
  gap?: number;
}

function Carousel({ children, itemWidth = 240, gap = 16 }: CarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const checkScroll = () => {
    const container = scrollRef.current;
    if (!container) return;

    setShowLeftArrow(container.scrollLeft > 20);
    setShowRightArrow(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 20
    );
  };

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const targetScroll = direction === "left"
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: targetScroll,
      behavior: "smooth",
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.pageX - (scrollRef.current?.offsetLeft || 0));
    setScrollLeft(scrollRef.current?.scrollLeft || 0);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const container = scrollRef.current;
    if (!container) return;

    const x = e.pageX - (container.offsetLeft || 0);
    const walk = (x - startX) * 1.5;
    container.scrollLeft = scrollLeft - walk;
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    checkScroll();
    container.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      container.removeEventListener("scroll", checkScroll);
      container.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <div className="relative group">
      {/* Left Arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -ml-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border hairline transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--deep-green)]"
          aria-label="Scroll left"
        >
          <ChevronLeft size={20} className="text-[var(--ink)]" />
        </button>
      )}

      {/* Scrollable Container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollBehavior: "smooth",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
      >
        <div
          className="flex w-max gap-3 sm:gap-4 lg:gap-5 px-4 sm:px-6 lg:px-10"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
          }}
        >
          {children}
        </div>
      </div>

      {/* Right Arrow */}
      {showRightArrow && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 -mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border hairline transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--deep-green)]"
          aria-label="Scroll right"
        >
          <ChevronRight size={20} className="text-[var(--ink)]" />
        </button>
      )}
    </div>
  );
}

function HorizontalProductCarousel({
  products,
}: {
  products: StoreProduct[];
}) {
  return (
    <Carousel>
      {products.map((product) => (
        <div
          key={product.id}
          className="w-[38vw] min-w-[132px] max-w-[156px] shrink-0 sm:w-[200px] sm:max-w-[200px] lg:w-[240px] lg:max-w-[240px]"
        >
          <ProductCard product={product} homeCompact />
        </div>
      ))}
    </Carousel>
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
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-7">
      <div>
        {eyebrow && <p className="kicker text-[var(--muted)]">{eyebrow}</p>}
        <h2 className="mt-1.5 text-[clamp(1.35rem,4vw,2.8rem)] font-semibold tracking-[-0.045em] sm:mt-2">
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

function PriceRangeCarousel() {
  const priceRanges = [
    ["Under KES 500", "under-500"],
    ["KES 500–1,000", "500-1000"],
    ["KES 1,000–2,500", "1000-2500"],
    ["KES 2,500–5,000", "2500-5000"],
    ["Above KES 5,000", "above-5000"],
  ];

  return (
    <Carousel>
      {priceRanges.map(([label, value]) => (
        <Link
          key={value}
          href={`/shop?price=${value}`}
          className="flex min-w-[180px] flex-col items-start justify-between rounded-xl border hairline bg-[var(--paper)] p-5 transition-shadow hover:shadow-md sm:min-w-[200px] lg:min-w-[220px]"
        >
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">Shop by price</p>
            <p className="mt-2 text-sm font-semibold">{label}</p>
          </div>
          <ArrowRight size={15} className="mt-3 transition-transform group-hover:translate-x-1" />
        </Link>
      ))}
    </Carousel>
  );
}

function TrustCarousel() {
  return (
    <Carousel>
      {trustItems.map(({ Icon, title, description }) => (
        <div
          key={title}
          className="flex min-w-[220px] flex-col gap-3 rounded-xl border hairline bg-[var(--paper)] p-5 sm:min-w-[240px] lg:min-w-[260px]"
        >
          <Icon size={20} strokeWidth={1.5} className="text-[var(--deep-green)]" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em]">{title}</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{description}</p>
          </div>
        </div>
      ))}
    </Carousel>
  );
}

function CategorySectionRail({
  category,
  products,
}: {
  category: ShopCategory;
  products: StoreProduct[];
}) {
  return (
    <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
      <SectionHeading
        eyebrow="Shop the collection"
        title={category.title}
        href={`/shop?category=${encodeURIComponent(category.slug)}`}
      />
      <HorizontalProductCarousel products={products} />
    </section>
  );
}

export default function ShopLanding({
  products,
  navigation,
  settings,
  featuredLook,
}: {
  products: StoreProduct[];
  navigation: ShopNavigation;
  settings?: PublicSiteSettings;
  featuredLook?: ShopLook | null;
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

  const heroEyebrow = settings?.homeHeroEyebrow?.trim() || "Beautiful spaces decor";
  const configuredHeroTitle = settings?.homeHeroTitle?.trim();
  const heroTitle = (configuredHeroTitle || "Beautiful spaces don't have to cost a fortune.")
    .replace(/beautiful homes/gi, "Beautiful spaces");
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

  const categoryCarouselItems: CategoryCarouselItem[] = [
    {
      id: "shop-by-look",
      title: "Shop by Look",
      href: "/shop-by-look",
      imageUrl: featuredLook?.heroImageUrl || heroImage || null,
    },
    ...navigation.categories.map((category) => {
      const categoryProducts = productsForCategory(availableProducts, category);
      return {
        id: category.id,
        title: category.title,
        href: `/shop?category=${encodeURIComponent(category.slug)}`,
        imageUrl: category.imageUrl || categoryProducts.find((product) => product.heroImage)?.heroImage || null,
      };
    }),
  ];

  return (
    <div className="bg-[var(--paper)]">
      {/* Hero Section */}
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
                <p className="max-w-md text-3xl font-medium tracking-[-0.04em]">Curated pieces for considered Kenyan spaces.</p>
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

      {/* 1. Shop by Category - AUTO CAROUSEL */}
      <section id="shop-by-category" className="border-b hairline px-4 py-9 sm:px-6 lg:px-10 lg:py-12">
        <SectionHeading title="Shop by category" href="/shop" />
        <AutoCategoryCarousel items={categoryCarouselItems} />
      </section>

      {/* 2. Best Sellers - HORIZONTAL CAROUSEL */}
      {bestSellerRail.length > 0 && (
        <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
          <SectionHeading eyebrow="Popular right now" title="Best sellers" href="/shop?collection=best-sellers" />
          <HorizontalProductCarousel products={bestSellerRail} />
        </section>
      )}

      {/* 3. New Arrivals - HORIZONTAL CAROUSEL */}
      {newArrivalRail.length > 0 && (
        <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
          <SectionHeading eyebrow="Fresh for the home" title="New arrivals" href="/shop?collection=new-arrivals" />
          <HorizontalProductCarousel products={newArrivalRail} />
        </section>
      )}

      {/* 4. Shop the Look - FULL WIDTH LAYOUT (NOT A CAROUSEL) */}
      {featuredLook && (
        <section className="relative border-t hairline w-full border-b hairline bg-[var(--paper-2)]">
          <div className="grid w-full overflow-hidden bg-[var(--paper)] lg:grid-cols-[1fr_0.95fr]">
            {/* Image Section */}
            <Link
              href={`/shop-by-look/${featuredLook.slug}`}
              className="group relative w-full overflow-hidden bg-[var(--paper-2)] min-h-[240px] sm:min-h-[300px] md:min-h-[400px] lg:min-h-[520px]"
            >
              {featuredLook.heroImageUrl ? (
                <Image
                  src={featuredLook.heroImageUrl}
                  alt={featuredLook.title}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 60vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                />
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-black/10 to-transparent" />

              {/* Badge - Bottom on mobile, top-left on tablet+ */}
              <div className="absolute  left-3 right-3 bottom-3 sm:left-4 sm:right-4 sm:bottom-4 sm:p-4 md:left-5 md:top-5 md:bottom-auto md:right-auto md:max-w-[220px] md:p-4 lg:left-7 lg:top-7 lg:max-w-[270px] lg:p-5">
                <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--paper)] sm:text-[10px]">
                  Shop the look
                </p>
                <p className="mt-1 text-[9px] leading-4 text-[var(--paper-2)] sm:mt-1.5 sm:text-[10px] sm:leading-4 md:text-[11px] md:leading-5 lg:text-xs">
                  Everything in this room is from Decor by Kasiwa.
                </p>

              </div>
            </Link>

            {/* Content Section */}
            <div className="relative flex flex-col justify-between p-4 min-h-[240px] sm:min-h-[280px] sm:p-5 md:p-6 lg:min-h-[520px] lg:p-10 xl:p-14">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[var(--muted)] sm:text-[9px] md:text-[10px]">
                  {featuredLook.eyebrow || "The curated edit"}
                </p>
                <h2 className="mt-1 text-[clamp(1.1rem,4.5vw,1.6rem)] font-semibold leading-[1.1] tracking-[-0.04em] text-[var(--ink)] sm:mt-1.5 sm:text-[clamp(1.3rem,4vw,2rem)] md:mt-2 md:text-[clamp(1.5rem,3.5vw,2.2rem)] lg:text-[clamp(1.55rem,3vw,2.45rem)]">
                  {featuredLook.title}
                </h2>

                <p className="mt-1.5 line-clamp-2 text-[9px] leading-4 text-[var(--muted)] sm:mt-2 sm:text-[10px] sm:leading-4 md:mt-3 md:text-xs md:leading-5">
                  {featuredLook.products
                    .slice(0, 4)
                    .map((line) => line.product.name)
                    .join(" + ")}
                </p>
                <p className="mt-0.5 text-[9px] font-medium text-[var(--ink)] sm:mt-1 sm:text-[10px] md:text-[11px]">
                  Complete the look with {featuredLook.totalUnits}{" "}
                  {featuredLook.totalUnits === 1 ? "piece" : "pieces"}.
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:gap-3 md:mt-5 md:gap-4">
                {/* Price and Image Row */}
                <div className="flex items-center justify-between gap-2 sm:gap-3 md:grid md:grid-cols-[1fr_auto] md:items-end md:gap-4">
                  <div>
                    <p className="text-[7px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] sm:text-[8px] md:text-[9px]">
                      Complete look
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tracking-[-0.04em] text-[var(--ink)] sm:mt-0.5 sm:text-xl md:mt-1 md:text-2xl">
                      {formatMoney(featuredLook.totalPrice)}
                    </p>
                    <p className="mt-0.5 text-[8px] text-[var(--muted)] sm:mt-0.5 sm:text-[9px] md:mt-1 md:text-[10px]">
                      {featuredLook.products.length} curated products
                    </p>
                  </div>

                  {featuredLook.products[0]?.product.heroImage ? (
                    <div className="relative size-14 overflow-hidden rounded-lg bg-[var(--paper-2)] shadow-sm sm:size-16 sm:rounded-xl md:size-20 lg:size-60">
                      <Image
                        src={featuredLook.products[0].product.heroImage}
                        alt={featuredLook.products[0].product.name}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 56px, (max-width: 1024px) 80px, 112px"
                        className="object-contain"
                      />
                    </div>
                  ) : null}
                </div>

                {/* View Complete Look Button */}
                <Link
                  href={`/shop-by-look/${featuredLook.slug}`}
                  className="group inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--deep-green)] px-3 text-[8px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:opacity-90 active:scale-[0.98] sm:min-h-10 sm:w-fit sm:px-4 sm:text-[9px] md:min-h-11 md:px-5"
                >
                  View complete look
                  <ArrowRight
                    size={10}
                    className="transition-transform group-hover:translate-x-1 sm:size-[11px] md:size-[13px]"
                  />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Category Sections - HORIZONTAL CAROUSELS */}
      {categorySections.map(({ category, products: categoryProducts }) => (
        <CategorySectionRail key={category.id} category={category} products={categoryProducts} />
      ))}

      {/* Shop by Price - HORIZONTAL CAROUSEL */}
      <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
        <SectionHeading title="Shop by price" href="/shop" />
        <PriceRangeCarousel />
      </section>

      {/* Trust Items - HORIZONTAL CAROUSEL */}
      <section className="border-b hairline px-4 py-5 sm:px-6 sm:py-9 lg:px-10 lg:py-12">
        <SectionHeading eyebrow="Why shop with us" title="Trusted & curated" href="/about" />
        <TrustCarousel />
      </section>
    </div>
  );
}
