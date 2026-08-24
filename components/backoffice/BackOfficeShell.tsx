"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  PackageOpen,
  Settings,
  ShoppingBag,
  Truck,
  Warehouse,
} from "lucide-react";

import { Logo } from "@/public/index";

type Mode = "admin" | "store";

type Props = {
  mode: Mode;
  children: ReactNode;
};

const adminNavigation = [
  ["Overview", "/admin", LayoutDashboard],
  ["Orders", "/admin/orders", ShoppingBag],
  ["Products & Stock", "/admin/products", Boxes],
  ["Customers", "/admin/customers", ContactRound],
  ["Shipments", "/admin/shipments", Truck],
  ["Analytics", "/admin/analytics", ChartNoAxesCombined],
] as const;

const storeNavigation = [
  ["Store overview", "/store", Warehouse],
  ["Order queue", "/store/orders", ClipboardList],
  ["Shipments", "/store/shipments", PackageOpen],
  ["Inventory", "/store/inventory", Boxes],
  ["Dispatch", "/store/dispatch", PackageCheck],
] as const;

export default function BackOfficeShell({ mode, children }: Props) {
  const pathname = usePathname();
  const navigation = mode === "admin" ? adminNavigation : storeNavigation;
  const title = mode === "admin" ? "Admin Office" : "Store Operations";
  const rootHref = mode === "admin" ? "/admin" : "/store";

  return (
    <div className="min-h-screen bg-[var(--paper-2)] text-[var(--deep-green)]">
      <div className="grid min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--ink)]/[0.09] bg-[var(--deep-green)] text-white">
          <div className="sticky top-0 flex min-h-screen flex-col px-4 py-5">
            <Link href={rootHref} className="block border-b border-white/15 pb-5">
              <Image
                src={Logo}
                alt="Decor by Kasiwa"
                width={260}
                height={130}
                priority
                className="h-auto w-[155px] brightness-0 invert"
              />

              <div className="mt-5 flex items-center gap-3">
                <span className="h-px w-7 bg-white/30" />
                <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/55">
                  {title}
                </span>
              </div>
            </Link>

            <nav className="mt-8 flex-1" aria-label={`${title} navigation`}>
              {navigation.map(([label, href, Icon], index) => {
                const active =
                  pathname === href ||
                  (href !== rootHref && pathname.startsWith(`${href}/`));

                return (
                  <Link
                    key={href}
                    href={href}
                    className={[
                      "group flex items-center justify-between border-b border-white/10 py-3.5",
                      "text-[10px] transition-colors duration-200",
                      active ? "text-white" : "text-white/48 hover:text-soft-cream",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={15} strokeWidth={1.35} />
                      <span>{label}</span>
                    </span>
                    <span className="text-[8px] tracking-[0.12em] text-white/25">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-white/15 pt-4">
              <Link
                href="/"
                className="flex items-center gap-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-soft-cream"
              >
                <ArrowLeft size={13} strokeWidth={1.4} />
                Customer site
              </Link>

              {mode === "admin" && (
                <Link
                  href="/store"
                  className="flex items-center gap-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-soft-cream"
                >
                  <Warehouse size={13} strokeWidth={1.4} />
                  Open store operations
                </Link>
              )}

              {mode === "store" && (
                <Link
                  href="/admin"
                  className="flex items-center gap-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/50 transition-colors hover:text-soft-cream"
                >
                  <LayoutDashboard size={13} strokeWidth={1.4} />
                  Open admin
                </Link>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <button
                  type="button"
                  className="text-white/40 transition-colors hover:text-soft-cream"
                  aria-label="Settings"
                >
                  <Settings size={15} strokeWidth={1.3} />
                </button>
                <button
                  type="button"
                  className="text-white/40 transition-colors hover:text-soft-cream"
                  aria-label="Sign out"
                >
                  <LogOut size={15} strokeWidth={1.3} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex min-h-[78px] items-center justify-between border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] px-5 sm:px-7 lg:px-9">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Decor by Kasiwa
              </p>
              <p className="mt-1 text-[11px] font-medium">{title}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden text-[8px] uppercase tracking-[0.12em] text-[var(--muted)] sm:inline">
                Live operations
              </span>
              <span className="size-1.5 rounded-full bg-[var(--sage-green)]" />
              <div className="grid size-9 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper-2)] text-[10px] font-semibold">
                DK
              </div>
            </div>
          </header>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
