"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, Suspense, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CircleUserRound, Heart, Menu, Search, ShoppingBag, X } from "lucide-react";

import { Logo } from "@/public/index";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import type { ShopNavigation } from "@/types/commerce";

const topNavigation = [
  { label: "Home", href: "/", key: "home" },
  { label: "Shop", href: "/shop", key: "shop" },
  { label: "New Arrivals", href: "/shop?collection=new-arrivals", key: "new-arrivals" },
  { label: "Best Sellers", href: "/shop?collection=best-sellers", key: "best-sellers" },
  { label: "About", href: "/about", key: "about" },
  { label: "Contact", href: "/contact", key: "contact" },
] as const;

const priceLinks = [
  { label: "Under KES 500", href: "/shop?price=under-500" },
  { label: "KES 500 – 1,000", href: "/shop?price=500-1000" },
  { label: "KES 1,000 – 2,500", href: "/shop?price=1000-2500" },
  { label: "KES 2,500 – 5,000", href: "/shop?price=2500-5000" },
  { label: "Above KES 5,000", href: "/shop?price=above-5000" },
] as const;

function TopNavigation({
  pathname,
  shopMenuOpen,
  onShopOpen,
  onShopClose,
  onShopToggle,
}: {
  pathname: string;
  shopMenuOpen: boolean;
  onShopOpen: () => void;
  onShopClose: () => void;
  onShopToggle: () => void;
}) {
  const searchParams = useSearchParams();
  const collection = searchParams.get("collection");

  function active(key: string) {
    if (key === "home") return pathname === "/";
    if (key === "shop") return pathname === "/shop" && !collection;
    if (key === "new-arrivals") return pathname === "/shop" && collection === "new-arrivals";
    if (key === "best-sellers") return pathname === "/shop" && collection === "best-sellers";
    if (key === "about") return pathname === "/about";
    if (key === "contact") return pathname === "/contact";
    return false;
  }

  return (
    <nav aria-label="Primary shop navigation" className="h-[44px] bg-[var(--paper-2)]">
      <div className="scrollbar-none flex h-full items-stretch overflow-x-auto">
        {topNavigation.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onMouseEnter={() => (item.key === "shop" ? onShopOpen() : onShopClose())}
            onFocus={() => (item.key === "shop" ? onShopOpen() : onShopClose())}
            onClick={(event) => {
              if (item.key !== "shop") return;
              if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
                event.preventDefault();
                onShopToggle();
              }
            }}
            aria-current={active(item.key) ? "page" : undefined}
            aria-haspopup={item.key === "shop" ? "menu" : undefined}
            aria-expanded={item.key === "shop" ? shopMenuOpen : undefined}
            className={[
              "relative flex h-full shrink-0 items-center justify-center px-[20px] text-[11px] font-medium text-[var(--charcoal)] transition-colors duration-200 sm:px-[24px] sm:text-[12px]",
              "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-charcoal/35",
              active(item.key) ? "z-10 rounded-t-[8px] bg-[var(--paper)]" : "hover:bg-charcoal/[0.025]",
            ].join(" ")}
          >
            {item.label}
            {item.key === "shop" && <ChevronDown size={13} className={`ml-1.5 hidden transition-transform sm:block ${shopMenuOpen ? "rotate-180" : ""}`} />}
          </Link>
        ))}
        <div className="min-w-6 flex-1" aria-hidden="true" />
      </div>
    </nav>
  );
}

function TopNavigationFallback({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Primary shop navigation" className="h-[44px] bg-[var(--paper-2)]">
      <div className="scrollbar-none flex h-full items-stretch overflow-x-auto">
        {topNavigation.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={[
              "relative flex h-full shrink-0 items-center justify-center px-[20px] text-[11px] font-medium text-[var(--charcoal)] sm:px-[24px] sm:text-[12px]",
              item.key === "home" && pathname === "/" ? "z-10 rounded-t-[8px] bg-[var(--paper)]" : "",
            ].join(" ")}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function MegaMenu({ navigation, onNavigate }: { navigation: ShopNavigation; onNavigate: () => void }) {
  return (
    <div role="menu" aria-label="Shop categories" className="absolute left-0 right-0 top-full hidden max-h-[72vh] overflow-y-auto border-y hairline bg-[var(--paper)] shadow-xl lg:block">
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(270px,1fr)] gap-12 px-8 py-9 xl:px-12">
        <div>
          <div className="mb-7 flex items-center justify-between border-b hairline pb-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--ink)]">Shop</p>
            <Link href="/shop" onClick={onNavigate} className="text-[12px] font-medium text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]">
              View all pieces
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-x-10 gap-y-9 xl:grid-cols-4">
            {navigation.categories.map((category) => (
              <div key={category.slug}>
                <Link href={`/shop?category=${encodeURIComponent(category.slug)}`} onClick={onNavigate} className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)] hover:opacity-60">
                  {category.title}
                </Link>
                {category.children.length > 0 && (
                  <div className="mt-3 grid gap-2.5">
                    {category.children.map((child) => (
                      <Link key={child.slug} href={`/shop?category=${encodeURIComponent(child.slug)}`} onClick={onNavigate} className="text-[13px] leading-5 text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
                        {child.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="grid content-start gap-7 border-l hairline pl-9">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Shop by Space</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {navigation.spaces.map((space) => <Link key={space.slug} href={`/shop?space=${space.slug}`} onClick={onNavigate} className="text-[13px] leading-5 text-[var(--muted)] hover:text-[var(--ink)]">{space.title}</Link>)}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Shop by Style</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {navigation.styles.map((style) => <Link key={style.slug} href={`/shop?style=${style.slug}`} onClick={onNavigate} className="text-[13px] leading-5 text-[var(--muted)] hover:text-[var(--ink)]">{style.title}</Link>)}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Shop by Price</p>
            <div className="mt-3 grid gap-2.5">
              {priceLinks.map((item) => <Link key={item.href} href={item.href} onClick={onNavigate} className="text-[13px] leading-5 text-[var(--muted)] hover:text-[var(--ink)]">{item.label}</Link>)}
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">Sale</p>
            <div className="mt-3 flex gap-5">
              <Link href="/shop?collection=offers" onClick={onNavigate} className="text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">Offers</Link>
              <Link href="/shop?collection=clearance" onClick={onNavigate} className="text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">Clearance</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MobileAccordion({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-soft-cream/15">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left text-[15px] font-semibold uppercase tracking-[0.08em] text-soft-cream"
      >
        <span>{title}</span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MobileCategoryRow({
  title,
  slug,
  children,
  onNavigate,
}: {
  title: string;
  slug: string;
  children: { title: string; slug: string }[];
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-soft-cream/10 last:border-b-0">
      <div className="flex min-h-12 items-center gap-2">
        <Link href={`/shop?category=${slug}`} onClick={onNavigate} className="flex flex-1 py-3 text-[14px] font-medium text-soft-cream/85">
          {title}
        </Link>
        {children.length > 0 && (
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${title}`} className="grid size-10 shrink-0 place-items-center rounded-full border border-soft-cream/10">
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && children.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="grid gap-1 border-l border-soft-cream/15 pb-3 pl-4">
              {children.map((child) => (
                <Link key={child.slug} href={`/shop?category=${child.slug}`} onClick={onNavigate} className="min-h-10 py-2 text-[14px] leading-6 text-soft-cream/60 hover:text-soft-cream">
                  {child.title}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SiteHeader({ navigation }: { navigation: ShopNavigation }) {
  const router = useRouter();
  const pathname = usePathname();
  const { cartCount, user, wishlist } = useCommerce();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setShopMenuOpen(false);
  }, [pathname]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = search.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  }

  const closeFullMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="sticky top-0 z-50 w-full">
        <div className="w-full bg-[var(--paper-2)]">
          <div className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center border-b border-charcoal/[0.045] px-4 sm:h-[90px] sm:px-5 lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="site-menu" aria-label="Open menu" className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-0.5 text-[11px] font-medium text-[var(--charcoal)] transition-opacity hover:opacity-55">
                <Menu size={24} strokeWidth={1.45} />
                <span>Menu</span>
              </button>

              <form onSubmit={handleSearch} className="hidden h-[34px] items-center rounded-full bg-[var(--soft-cream)] pl-3 pr-3 sm:flex">
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-32 bg-transparent pr-2 text-[11px] font-medium text-[var(--charcoal)] outline-none placeholder:text-charcoal/40 lg:w-48" placeholder="Light up your search" aria-label="Search the collection" />
                <button type="submit" className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--deep-green)] text-soft-cream" aria-label="Submit search"><Search size={12} strokeWidth={1.75} /></button>
              </form>
            </div>

            <Link href="/" aria-label="Decor by Kasiwa home" className="relative z-20 flex items-center justify-center">
              <Image src={Logo} alt="Decor by Kasiwa logo" width={400} height={300} priority quality={100} className="h-auto w-[160px] object-contain sm:w-[140px] lg:w-[190px]" />
            </Link>

            <div className="flex items-center justify-end gap-1.5">
              <Link href="/account" aria-label={user ? "Open my account" : "Sign in"} className="hidden h-10 items-center gap-2 rounded-full bg-[var(--soft-cream)] pl-3 pr-1.5 text-[10px] font-medium sm:inline-flex">
                <span className="max-w-20 truncate">{user ? user.name.split(" ")[0] : "Sign in"}</span>
                <span className="grid size-7.5 place-items-center rounded-full bg-[var(--sage-green)]"><CircleUserRound size={20} strokeWidth={1.1} /></span>
              </Link>
              <Link href="/wishlist" aria-label="Open saved items" className="relative grid size-10 place-items-center rounded-full bg-[var(--soft-cream)]">
                <Heart size={20} strokeWidth={1.45} />
                {wishlist.length > 0 && <span className="absolute -right-2 -top-0.5 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--deep-green)] px-1 text-[10px] font-semibold leading-none text-soft-cream">{wishlist.length > 99 ? "99+" : wishlist.length}</span>}
              </Link>
              <Link href="/cart" aria-label="Open shopping bag" className="relative grid size-10 place-items-center rounded-full bg-[var(--soft-cream)]">
                <ShoppingBag size={20} strokeWidth={1.45} />
                {cartCount > 0 && <span className="absolute -right-2 -top-0.5 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--deep-green)] px-1 text-[10px] font-semibold leading-none text-soft-cream">{cartCount > 99 ? "99+" : cartCount}</span>}
              </Link>
            </div>
          </div>

          <div className="relative" onMouseLeave={() => setShopMenuOpen(false)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShopMenuOpen(false); }}>
            <Suspense fallback={<TopNavigationFallback pathname={pathname} />}>
              <TopNavigation
                pathname={pathname}
                shopMenuOpen={shopMenuOpen}
                onShopOpen={() => setShopMenuOpen(true)}
                onShopClose={() => setShopMenuOpen(false)}
                onShopToggle={() => setShopMenuOpen((value) => !value)}
              />
            </Suspense>
            {shopMenuOpen && <MegaMenu navigation={navigation} onNavigate={() => setShopMenuOpen(false)} />}
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div id="site-menu" className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--deep-green)] text-[var(--paper)]" initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}>
            <div className="flex min-h-screen w-full flex-col px-4 pb-10 pt-5 md:px-8">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-soft-cream/10 bg-[var(--deep-green)] pb-4 pt-1">
                <span className="text-sm font-semibold tracking-[-0.04em]">DECOR BY KASIWA</span>
                <button type="button" onClick={closeFullMenu} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-soft-cream/20 px-4 py-2 text-[11px] uppercase tracking-[0.08em]" aria-label="Close menu">Close <X size={15} /></button>
              </div>

              {/* Mobile/tablet: client-requested collapsible navigation. */}
              <div className="mt-5 lg:hidden">
                <Link href="/" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">Home</Link>

                <MobileAccordion title="Shop" defaultOpen>
                  <div className="rounded-xl border border-soft-cream/10 px-4">
                    <Link href="/shop" onClick={closeFullMenu} className="flex min-h-12 items-center border-b border-soft-cream/10 text-[14px] font-semibold text-soft-cream">Shop all</Link>
                    {navigation.categories.map((category) => (
                      <MobileCategoryRow key={category.slug} title={category.title} slug={category.slug} children={category.children} onNavigate={closeFullMenu} />
                    ))}
                  </div>
                </MobileAccordion>

                <MobileAccordion title="Sale">
                  <div className="grid gap-1 pl-3">
                    <Link href="/shop?collection=offers" onClick={closeFullMenu} className="min-h-11 py-2 text-[14px] text-soft-cream/70">Offers</Link>
                    <Link href="/shop?collection=clearance" onClick={closeFullMenu} className="min-h-11 py-2 text-[14px] text-soft-cream/70">Clearance</Link>
                  </div>
                </MobileAccordion>

                <Link href="/shop?collection=new-arrivals" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">New Arrivals</Link>
                <Link href="/shop?collection=best-sellers" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">Best Sellers</Link>

                <MobileAccordion title="Shop By">
                  <div className="grid gap-7 rounded-xl border border-soft-cream/10 p-4">
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream">Shop by Space</p>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        {navigation.spaces.map((item) => <Link key={item.slug} href={`/shop?space=${item.slug}`} onClick={closeFullMenu} className="min-h-10 py-2 text-[14px] leading-5 text-soft-cream/60">{item.title}</Link>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream">Shop by Style</p>
                      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        {navigation.styles.map((item) => <Link key={item.slug} href={`/shop?style=${item.slug}`} onClick={closeFullMenu} className="min-h-10 py-2 text-[14px] leading-5 text-soft-cream/60">{item.title}</Link>)}
                      </div>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-soft-cream">Shop by Price</p>
                      <div className="mt-2 grid gap-1">
                        {priceLinks.map((item) => <Link key={item.href} href={item.href} onClick={closeFullMenu} className="min-h-10 py-2 text-[14px] leading-5 text-soft-cream/60">{item.label}</Link>)}
                      </div>
                    </div>
                  </div>
                </MobileAccordion>

                <Link href="/about" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">About Us</Link>
                <Link href="/contact" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">Contact</Link>
                <Link href="/account" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">My Account</Link>
                <Link href="/cart" onClick={closeFullMenu} className="flex min-h-14 items-center border-b border-soft-cream/15 py-3 text-[15px] font-semibold uppercase tracking-[0.08em]">Cart {cartCount > 0 ? `(${cartCount})` : ""}</Link>
              </div>

              {/* Desktop editorial menu retained, with the live Sanity taxonomy. */}
              <div className="mt-8 hidden gap-10 lg:grid lg:grid-cols-[0.8fr_1.2fr]">
                <nav className="grid content-start gap-3">
                  {topNavigation.map((item, index) => (
                    <motion.div key={item.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + index * 0.04 }}>
                      <Link href={item.href} onClick={closeFullMenu} className="text-[clamp(2.4rem,6vw,4.8rem)] font-medium leading-[0.95] tracking-[-0.07em] hover:opacity-65">{item.label}</Link>
                    </motion.div>
                  ))}
                  <Link href="/account" onClick={closeFullMenu} className="mt-4 text-sm uppercase tracking-[0.1em] text-soft-cream/70">My Account</Link>
                  <Link href="/cart" onClick={closeFullMenu} className="text-sm uppercase tracking-[0.1em] text-soft-cream/70">Cart</Link>
                </nav>

                <div className="grid gap-10 border-l border-soft-cream/15 pl-10">
                  <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
                    {navigation.categories.map((category) => (
                      <div key={category.slug}>
                        <Link href={`/shop?category=${category.slug}`} onClick={closeFullMenu} className="text-xs font-semibold uppercase tracking-[0.1em] text-soft-cream">{category.title}</Link>
                        {category.children.length > 0 && <div className="mt-3 grid gap-2">{category.children.map((child) => <Link key={child.slug} href={`/shop?category=${child.slug}`} onClick={closeFullMenu} className="text-sm text-soft-cream/55 hover:text-soft-cream">{child.title}</Link>)}</div>}
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-8 border-t border-soft-cream/15 pt-8 sm:grid-cols-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.1em]">Shop by Space</p><div className="mt-3 grid gap-2">{navigation.spaces.map((item) => <Link key={item.slug} href={`/shop?space=${item.slug}`} onClick={closeFullMenu} className="text-sm text-soft-cream/55 hover:text-soft-cream">{item.title}</Link>)}</div></div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.1em]">Shop by Style</p><div className="mt-3 grid gap-2">{navigation.styles.map((item) => <Link key={item.slug} href={`/shop?style=${item.slug}`} onClick={closeFullMenu} className="text-sm text-soft-cream/55 hover:text-soft-cream">{item.title}</Link>)}</div></div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.1em]">Shop by Price</p><div className="mt-3 grid gap-2 text-sm text-soft-cream/55">{priceLinks.map((item) => <Link key={item.href} href={item.href} onClick={closeFullMenu}>{item.label}</Link>)}</div></div>
                    <div><p className="text-xs font-semibold uppercase tracking-[0.1em]">Sale</p><div className="mt-3 grid gap-2 text-sm text-soft-cream/55"><Link href="/shop?collection=offers" onClick={closeFullMenu}>Offers</Link><Link href="/shop?collection=clearance" onClick={closeFullMenu}>Clearance</Link></div></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
