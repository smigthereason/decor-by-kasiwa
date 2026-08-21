"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  CircleUserRound,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";

import { Logo } from "@/public/index";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";

const categories = [
  {
    label: "Home",
    href: "/",
    value: "home",
  },
  {
    label: "Furniture",
    href: "/shop?category=Furniture",
    value: "Furniture",
  },
  {
    label: "Lighting",
    href: "/shop?category=Lighting",
    value: "Lighting",
  },
  {
    label: "Textiles",
    href: "/shop?category=Textiles",
    value: "Textiles",
  },
  {
    label: "Decor",
    href: "/shop?category=Decor",
    value: "Decor",
  },
  {
    label: "All",
    href: "/shop",
    value: "all",
  },
];

const primaryMenu = [
  ["About", "/about"],
  ["Services", "/services"],
  ["Portfolio", "/portfolio"],
  ["Shop", "/shop"],
  ["Our Process", "/process"],
  ["Consultation", "/consultation"],
];

/* ================================================================== */
/* CATEGORY NAVIGATION                                                  */
/* ================================================================== */

function CategoryNavigation({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category");

  function isCategoryActive(value: string) {
    if (value === "home") {
      return pathname === "/";
    }

    if (value === "all") {
      return pathname === "/shop" && !activeCategory;
    }

    return (
      pathname === "/shop" &&
      activeCategory?.toLowerCase() === value.toLowerCase()
    );
  }

  return (
    <nav aria-label="Shop categories" className="h-[44px] bg-[var(--paper-2)]">
      <div className="scrollbar-none flex h-full items-stretch overflow-x-auto">
        {categories.map(({ label, href, value }) => {
          const active = isCategoryActive(value);

          return (
            <Link
              key={label}
              href={href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex h-full shrink-0 items-center justify-center",
                "px-[20px] text-[11px] font-medium text-[#171717]",
                "transition-colors duration-200",
                "sm:px-[24px] sm:text-[12px]",
                "focus-visible:z-20 focus-visible:outline-none",
                "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-black/35",
                active
                  ? "z-10 rounded-t-[8px] bg-[var(--paper)]"
                  : "hover:bg-black/[0.025]",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}

        <div className="min-w-6 flex-1" aria-hidden="true" />
      </div>
    </nav>
  );
}

/* ================================================================== */
/* CATEGORY FALLBACK                                                    */
/* ================================================================== */

function CategoryNavigationFallback({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Shop categories" className="h-[44px] bg-[var(--paper-2)]">
      <div className="scrollbar-none flex h-full items-stretch overflow-x-auto">
        {categories.map(({ label, href, value }) => {
          const active = value === "home" && pathname === "/";

          return (
            <Link
              key={label}
              href={href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex h-full shrink-0 items-center justify-center",
                "px-[20px] text-[11px] font-medium text-[#171717]",
                "transition-colors duration-200",
                "sm:px-[24px] sm:text-[12px]",
                active ? "z-10 rounded-t-[8px] bg-[var(--paper)]" : "",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}

        <div className="min-w-6 flex-1" aria-hidden="true" />
      </div>
    </nav>
  );
}

/* ================================================================== */
/* SITE HEADER                                                          */
/* ================================================================== */

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();

  const { cartCount, user, wishlist } = useCommerce();

  const [menuOpen, setMenuOpen] = useState(false);

  const [search, setSearch] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = search.trim();

    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full">
        <div className="w-full  bg-(--paper-2)">
          {/* ======================================================== */}
          {/* PRIMARY ROW                                              */}
          {/* ======================================================== */}

          <div className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center border-b border-black/[0.045] px-4 sm:h-[90px] sm:px-5 lg:px-7">
            {/* LEFT */}

            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                aria-controls="site-menu"
                aria-label="Open menu"
                className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-0.5 text-[11px] font-medium text-[#171717] transition-opacity hover:opacity-55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8e4e1]"
              >
                <Menu
                  size={24}
                  strokeWidth={1.45}
                  className="transition-transform duration-300 group-hover:scale-95"
                />

                <span>Menu</span>
              </button>

              <form
                onSubmit={handleSearch}
                className="hidden h-[34px] items-center rounded-full bg-[#f4f1ef] pl-3 pr-3 sm:flex"
              >
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-32 bg-transparent pr-2 text-[8px] font-medium  tracking-[-0.01em] text-[#171717] outline-none placeholder:text-black/35 lg:w-48"
                  placeholder="Light up your search"
                  aria-label="Search the collection"
                />

                <button
                  type="submit"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-[#1a1a18] text-white transition-transform duration-200 hover:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  aria-label="Submit search"
                >
                  <Search size={12} strokeWidth={1.75} />
                </button>
              </form>
            </div>

            {/* LOGO */}

            <Link
              href="/"
              aria-label="Decor by Kasiwa home"
              className="relative z-20 flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8e4e1]"
            >
              <Image
                src={Logo}
                alt="Decor by Kasiwa logo"
                width={400}
                height={300}
                priority
                quality={100}
                className="h-auto w-[160px] object-contain sm:w-[140px] lg:w-[190px]"
              />
            </Link>

            {/* RIGHT */}

            <div className="flex items-center justify-end gap-1.5">
              <Link
                href="/account"
                aria-label={user ? "Open my account" : "Sign in"}
                className="hidden h-10 items-center gap-2 rounded-full bg-[#f4f1ef] pl-3 pr-1.5 text-[10px] font-medium transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35 sm:inline-flex"
              >
                <span className="max-w-20 truncate">
                  {user ? user.name.split(" ")[0] : "Sign in"}
                </span>

                <span className="grid size-7.5 place-items-center rounded-full bg-[#ddd7d2]">
                  <CircleUserRound size={20} strokeWidth={1.1} />
                </span>
              </Link>

              <Link
                href="/wishlist"
                aria-label={`Open saved items${
                  wishlist.length ? `, ${wishlist.length} items` : ""
                }`}
                className="relative grid size-10 place-items-center rounded-full bg-[#f4f1ef] transition-transform duration-200 hover:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35"
              >
                <Heart size={20} strokeWidth={1.45} />

                {wishlist.length > 0 && (
                  <span className="absolute -right-2 -top-0.5 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[#1a1a18] px-1 text-[10px] font-semibold leading-none text-white">
                    {wishlist.length > 99 ? "99+" : wishlist.length}
                  </span>
                )}
              </Link>

              <Link
                href="/cart"
                aria-label={`Open shopping bag${
                  cartCount ? `, ${cartCount} items` : ""
                }`}
                className="relative grid size-10 place-items-center rounded-full bg-[#f4f1ef] transition-transform duration-200 hover:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35"
              >
                <ShoppingBag size={20} strokeWidth={1.45} />

                {cartCount > 0 && (
                  <span className="absolute -right-2 -top-0.5 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[#1a1a18] px-1 text-[10px] font-semibold leading-none text-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* ======================================================== */}
          {/* CATEGORY NAVIGATION                                      */}
          {/* ======================================================== */}

          <Suspense
            fallback={<CategoryNavigationFallback pathname={pathname} />}
          >
            <CategoryNavigation pathname={pathname} />
          </Suspense>
        </div>
      </header>

      {/* ============================================================ */}
      {/* FULL SCREEN MENU                                              */}
      {/* ============================================================ */}

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="site-menu"
            className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--ink)] text-[var(--paper)]"
            initial={{
              y: "-100%",
            }}
            animate={{
              y: 0,
            }}
            exit={{
              y: "-100%",
            }}
            transition={{
              duration: 0.55,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            <div className="flex min-h-screen w-full flex-col px-4 pb-10 pt-5 md:px-8">
              {/* MENU HEADER */}

              <div className="flex items-center justify-between pb-4">
                <span className="text-sm font-semibold tracking-[-0.04em]">
                  DECOR BY KASIWA
                </span>

                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-[10px] uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
                  aria-label="Close menu"
                >
                  Close
                  <X size={14} />
                </button>
              </div>

              {/* NAVIGATION */}

              <nav className="mt-8 flex-1">
                {primaryMenu.map(([label, href], index) => (
                  <motion.div
                    key={label}
                    initial={{
                      opacity: 0,
                      y: 28,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    transition={{
                      delay: 0.08 + index * 0.055,
                    }}
                  >
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="group flex items-center justify-between py-3 text-[clamp(3rem,9vw,5rem)] font-medium leading-none tracking-[-0.075em]"
                    >
                      <span className="relative inline-block transition-transform duration-300 ease-out origin-left group-hover:scale-[1.03]">
                        {label}
                        <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[var(--paper-2)] transition-all duration-300 ease-out group-hover:w-full" />
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {/* MENU FOOTER */}

              <div className="mt-10 grid gap-6 border-t border-(--paper) hairline pt-5 text-xs text-white/55 sm:grid-cols-[1fr_auto] sm:items-end">
                <p className="max-w-md leading-relaxed">
                  Interior design, décor and transformation for spaces that feel
                  considered, personal and complete.
                </p>

                <div className="flex flex-wrap gap-x-5 gap-y-3 text-[10px] uppercase tracking-[0.08em] text-white">
                  <Link href="/wishlist" onClick={() => setMenuOpen(false)}>
                    Saved items
                  </Link>

                  <Link
                    href="/consultation"
                    onClick={() => setMenuOpen(false)}
                    className="inline-flex items-center gap-2"
                  >
                    Start a project
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
