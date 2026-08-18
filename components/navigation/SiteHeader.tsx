"use client";

import Link from "next/link";
import { Logo } from "@/public/index";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Menu,
  Search,
  ShoppingBag,
  X,
  CircleUserRound,
  Heart,
} from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";

const categories = [
  { label: "Home", href: "/", value: "home" },
  { label: "Furniture", href: "/shop?category=Furniture", value: "Furniture" },
  { label: "Lighting", href: "/shop?category=Lighting", value: "Lighting" },
  { label: "Textiles", href: "/shop?category=Textiles", value: "Textiles" },
  { label: "Décor", href: "/shop?category=Decor", value: "Decor" },
  { label: "All", href: "/shop", value: "all" },
];

const primaryMenu = [
  ["About", "/about"],
  ["Services", "/services"],
  ["Portfolio", "/portfolio"],
  ["Shop", "/shop"],
  ["Our Process", "/process"],
  ["Consultation", "/consultation"],
];

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { cartCount, user } = useCommerce();

  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeCategory = searchParams.get("category");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const term = search.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  }

  function isCategoryActive(value: string) {
    if (value === "home") return pathname === "/";

    if (value === "all") {
      return pathname === "/shop" && !activeCategory;
    }

    return pathname === "/shop" && activeCategory === value;
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full">
        {/*
          The header is intentionally one continuous surface.
          No outer horizontal margin and no detached card appearance.
        */}
        <div className="w-full bg-[#e8e4e1]">
          {/* ============================================================ */}
          {/* PRIMARY ROW                                                  */}
          {/* ============================================================ */}
          <div className="grid h-[58px] grid-cols-[1fr_auto_1fr] items-center border-b border-black/[0.045] px-4 sm:px-5 lg:px-7">
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
                  size={15}
                  strokeWidth={1.45}
                  className="transition-transform duration-300 group-hover:scale-95"
                />
                <span>Menu</span>
              </button>

              <form
                onSubmit={handleSearch}
                className="hidden h-[34px] items-center rounded-full bg-[#f4f1ef] pl-3 pr-[3px] sm:flex"
              >
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-[116px] bg-transparent pr-2 text-[8px] font-medium uppercase tracking-[-0.01em] text-[#171717] outline-none placeholder:text-black/35 lg:w-[150px]"
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

            {/* CENTER LOGO — no card, no background */}
            <Link
              href="/"
              aria-label="Decor by Kasiwa home"
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#e8e4e1]"
            >
              <Image
                src={Logo}
                alt="Decor by Kasiwa logo"
                width={340}
                height={150}
                priority
                quality={100}
                className="h-auto w-[84px] object-contain sm:w-[92px] lg:w-[98px]"
              />
            </Link>

            {/* RIGHT */}
            <div className="flex items-center justify-end gap-1.5">
              <Link
                href="/account"
                aria-label={user ? "Open my account" : "Sign in"}
                className="hidden h-[34px] items-center gap-2 rounded-full bg-[#f4f1ef] pl-3 pr-1.5 text-[8px] font-medium transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35 sm:inline-flex"
              >
                <span className="max-w-[72px] truncate">
                  {user ? "My account" : "Sign in"}
                </span>

                <span className="grid size-[26px] place-items-center rounded-full bg-[#ddd7d2]">
                  <CircleUserRound size={15} strokeWidth={1.1} />
                </span>
              </Link>

              <Link
                href="/wishlist"
                aria-label="Open saved items"
                className="grid size-[34px] place-items-center rounded-full bg-[#f4f1ef] transition-transform duration-200 hover:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35"
              >
                <Heart size={14} strokeWidth={1.45} />
              </Link>

              <Link
                href="/cart"
                aria-label={`Open shopping bag${
                  cartCount ? `, ${cartCount} items` : ""
                }`}
                className="relative grid size-[34px] place-items-center rounded-full bg-[#f4f1ef] transition-transform duration-200 hover:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/35"
              >
                <ShoppingBag size={14} strokeWidth={1.45} />

                {cartCount > 0 && (
                  <span className="absolute -right-[1px] -top-[1px] grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[#1a1a18] px-1 text-[7px] font-semibold leading-none text-white">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* ============================================================ */}
          {/* CATEGORY ROW                                                 */}
          {/* ============================================================ */}
          <nav
            aria-label="Shop categories"
            className="h-[38px] bg-[#e2dedb]"
          >
            <div className="scrollbar-none flex h-full items-stretch overflow-x-auto">
              {categories.map(({ label, href, value }) => {
                const active = isCategoryActive(value);

                return (
                  <Link
                    key={label}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "relative flex h-full shrink-0 items-center justify-center",
                      "px-[20px] text-[10px] font-medium text-[#171717]",
                      "transition-colors duration-200 sm:px-[24px]",
                      "focus-visible:z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-black/35",
                      active
                        ? [
                            /*
                              IMPORTANT:
                              var(--paper) is also the shop-page surface.
                              The tab therefore visually merges with the content
                              below instead of looking like a separate white button.
                            */
                            "z-10 bg-[var(--paper)]",
                            "rounded-t-[8px]",
                          ].join(" ")
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
        </div>
      </header>

      {/* ================================================================ */}
      {/* FULL SCREEN MENU                                                  */}
      {/* ================================================================ */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="site-menu"
            className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--ink)] text-[var(--paper)]"
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{
              duration: 0.55,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            <div className="flex min-h-screen w-full flex-col px-4 pb-10 pt-5 md:px-8">
              <div className="flex items-center justify-between pb-4">
                <span className="text-sm font-semibold tracking-[-0.04em]">
                  KASIWA
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

              <nav className="mt-8 flex-1">
                {primaryMenu.map(([label, href], index) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.08 + index * 0.055,
                    }}
                  >
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      className="group flex items-center justify-between border-b border-white/20 py-3 text-[clamp(3rem,9vw,7rem)] font-medium leading-none tracking-[-0.075em]"
                    >
                      <span>{label}</span>

                      <span className="text-xs tracking-normal text-white/45 transition-transform group-hover:translate-x-1">
                        0{index + 1}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </nav>

              <div className="mt-10 grid gap-6 border-t border-white/15 pt-5 text-xs text-white/55 sm:grid-cols-[1fr_auto] sm:items-end">
                <p className="max-w-md leading-relaxed">
                  Interior design, décor and transformation for spaces that feel
                  considered, personal and complete.
                </p>

                <div className="flex flex-wrap gap-x-5 gap-y-3 text-[10px] uppercase tracking-[0.08em] text-white">
                  <Link
                    href="/wishlist"
                    onClick={() => setMenuOpen(false)}
                  >
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
