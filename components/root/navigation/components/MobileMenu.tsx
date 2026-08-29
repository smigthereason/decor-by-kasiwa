import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import type { ShopNavigation } from "@/types/commerce";
import { MobileAccordion } from "./MobileAccordion";
import { MobileCategoryRow } from "./MobileCategoryRow";
import { priceLinks, categoryHref } from "../constants/navigation";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  navigation: ShopNavigation;
  search: string;
  setSearch: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function MobileMenuHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between bg-[var(--deep-green)] pb-4 pt-1">
      <span className="text-[12px] font-semibold tracking-[-0.03em] text-soft-cream sm:text-sm">
        DECOR BY KASIWA
      </span>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-soft-cream/10 px-4 py-2 text-[11px] uppercase tracking-[0.08em] text-soft-cream/70 transition-all hover:bg-soft-cream/20 hover:text-soft-cream"
        aria-label="Close menu"
      >
        Close
        <X size={15} />
      </button>
    </div>
  );
}

type MobileSearchProps = Pick<
  MobileMenuProps,
  "search" | "setSearch" | "onSubmit"
>;

function MobileSearch({
  search,
  setSearch,
  onSubmit,
}: MobileSearchProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 flex h-[50px] w-full items-center rounded-full bg-soft-cream/10 px-2 pl-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      <Search size={18} strokeWidth={1.5} className="mr-3 shrink-0 text-soft-cream/40" />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search products, categories or SKU"
        aria-label="Search Decor by Kasiwa"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-soft-cream outline-none placeholder:text-soft-cream/30"
      />
      <button
        type="submit"
        aria-label="Search"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-soft-cream/15 text-soft-cream transition-all hover:bg-soft-cream/25"
      >
        <Search size={15} strokeWidth={1.7} />
      </button>
    </form>
  );
}

export function MobileMenu({ isOpen, onClose, navigation, search, setSearch, onSubmit }: MobileMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="site-menu"
          className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--deep-green)] text-[var(--paper)] shadow-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{
            duration: 0.38,
            ease: [0.76, 0, 0.24, 1],
          }}
        >
          <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-12 pt-5 sm:px-8 sm:pb-14 sm:pt-6">
            <MobileMenuHeader onClose={onClose} />
            <MobileSearch search={search} setSearch={setSearch} onSubmit={onSubmit} />

            <nav aria-label="Mobile navigation" className="mt-6 space-y-0.5">
              <Link
                href="/"
                onClick={onClose}
                className="flex min-h-14 items-center py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-colors hover:text-soft-cream/80"
              >
                Home
              </Link>

              <MobileAccordion title="Shop">
                <div className="rounded-xl bg-soft-cream/5 px-4">
                  <Link
                    href="/shop"
                    onClick={onClose}
                    className="flex min-h-12 items-center border-b border-soft-cream/5 text-[14px] font-semibold text-soft-cream transition-colors hover:text-soft-cream/80"
                  >
                    Shop all
                  </Link>
                  <Link
                    href="/shop-by-look"
                    onClick={onClose}
                    className="flex min-h-12 items-center border-b border-soft-cream/5 text-[14px] font-semibold text-soft-cream transition-colors hover:text-soft-cream/80"
                  >
                    Shop by Look <span className="ml-2 text-[9px] uppercase tracking-[0.08em] text-soft-cream/45">Coming soon</span>
                  </Link>
                  {navigation.categories.map((category) => (
                    <MobileCategoryRow
                      key={category.slug}
                      title={category.title}
                      slug={category.slug}
                      children={category.children}
                      onNavigate={onClose}
                    />
                  ))}
                </div>
              </MobileAccordion>

              <MobileAccordion title="Sale">
                <div className="grid gap-1 pl-3">
                  <Link
                    href="/shop?collection=offers"
                    onClick={onClose}
                    className="flex min-h-11 items-center py-2 text-[14px] text-soft-cream/60 transition-colors hover:text-soft-cream"
                  >
                    Offers
                  </Link>
                  <Link
                    href="/shop?collection=clearance"
                    onClick={onClose}
                    className="flex min-h-11 items-center py-2 text-[14px] text-soft-cream/60 transition-colors hover:text-soft-cream"
                  >
                    Clearance
                  </Link>
                </div>
              </MobileAccordion>

              <Link
                href="/shop?collection=new-arrivals"
                onClick={onClose}
                className="flex min-h-14 items-center py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-colors hover:text-soft-cream/80"
              >
                New Arrivals
              </Link>

              <Link
                href="/shop?collection=best-sellers"
                onClick={onClose}
                className="flex min-h-14 items-center py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-colors hover:text-soft-cream/80"
              >
                Best Sellers
              </Link>

              <MobileAccordion title="Shop By">
                <div className="grid gap-7 rounded-xl bg-soft-cream/5 p-4">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream/60">
                      Shop by Space
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      {navigation.spaces.map((item) => (
                        <Link
                          key={item.slug}
                          href={`/shop?space=${encodeURIComponent(item.slug)}`}
                          onClick={onClose}
                          className="min-h-10 py-2 text-[14px] leading-5 text-soft-cream/50 transition-colors hover:text-soft-cream"
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream/60">
                      Shop by Style
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      {navigation.styles.map((item) => (
                        <Link
                          key={item.slug}
                          href={`/shop?style=${encodeURIComponent(item.slug)}`}
                          onClick={onClose}
                          className="min-h-10 py-2 text-[14px] leading-5 text-soft-cream/50 transition-colors hover:text-soft-cream"
                        >
                          {item.title}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream/60">
                      Shop by Price
                    </p>
                    <div className="mt-2 grid gap-1">
                      {priceLinks.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          className="flex min-h-10 items-center py-2 text-[14px] leading-5 text-soft-cream/50 transition-colors hover:text-soft-cream"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </MobileAccordion>

              <Link
                href="/about"
                onClick={onClose}
                className="flex min-h-14 items-center py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-colors hover:text-soft-cream/80"
              >
                About Us
              </Link>

              <Link
                href="/contact"
                onClick={onClose}
                className="flex min-h-14 items-center py-3 text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-colors hover:text-soft-cream/80"
              >
                Contact
              </Link>
            </nav>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}