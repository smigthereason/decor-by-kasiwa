import Link from "next/link";
import { Layers3 } from "lucide-react";
import { CategoryCard } from "./CategoryCard";
import { SaleCard } from "./SaleCard";
import { priceLinks } from "../constants/navigation";
import type { ShopNavigation } from "@/types/commerce";

interface MegaMenuProps {
  navigation: ShopNavigation;
  onNavigate: () => void;
}

export function MegaMenu({ navigation, onNavigate }: MegaMenuProps) {
  const clearanceCategory = navigation.categories.find(
    (category) => category.slug === "clearance"
  );

  return (
    <div
      role="menu"
      aria-label="Shop categories"
      className="absolute left-0 right-0 top-full hidden max-h-[calc(100vh-134px)] overflow-y-auto bg-[var(--paper)] shadow-[0_18px_50px_rgba(0,0,0,0.09)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block"
    >
      <div className="px-7 pb-8 pt-6 xl:px-9">
        {/* Menu Intro */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)]">Shop</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">Explore the Decor by Kasiwa collection</p>
          </div>
          <Link
            href="/shop"
            onClick={onNavigate}
            className="text-[11px] font-medium text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]"
          >
            View all pieces
          </Link>
        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-4 items-stretch gap-x-5 gap-y-7 xl:grid-cols-6">
          <Link
            href="/shop-by-look"
            onClick={onNavigate}
            className="group flex min-h-[190px] flex-col justify-between rounded-xl border hairline bg-[var(--deep-green)] p-4 text-[var(--soft-cream)] transition-transform duration-300 hover:-translate-y-1"
          >
            <div className="grid size-10 place-items-center rounded-full bg-white/10"><Layers3 size={18} /></div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/55">Coming soon</p>
              <p className="mt-2 text-sm font-semibold">Shop by Look</p>
              <p className="mt-1 text-[10px] leading-4 text-white/60">Complete room edits or individual pieces.</p>
            </div>
          </Link>
          {navigation.categories.map((category) => (
            <CategoryCard
              key={category.slug}
              title={category.title}
              slug={category.slug}
              imageUrl={category.imageUrl}
              children={category.children}
              onNavigate={onNavigate}
            />
          ))}
          <SaleCard onNavigate={onNavigate} clearanceCategory={clearanceCategory} />
        </div>

        {/* Shop By Footer */}
        <div className="mt-8 grid grid-cols-3 gap-8 border-t border-[var(--ink)]/[0.08] pt-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink)]">
              Shop by Space
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {navigation.spaces.map((space) => (
                <Link
                  key={space.slug}
                  href={`/shop?space=${encodeURIComponent(space.slug)}`}
                  onClick={onNavigate}
                  className="text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {space.title}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink)]">
              Shop by Style
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {navigation.styles.map((style) => (
                <Link
                  key={style.slug}
                  href={`/shop?style=${encodeURIComponent(style.slug)}`}
                  onClick={onNavigate}
                  className="text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {style.title}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--ink)]">
              Shop by Price
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {priceLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className="text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}