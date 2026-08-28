"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PackageOpen,
  SearchCheck,
  Settings,
  ShoppingBag,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { useBackofficeNotifications } from "@/lib/operations/client";
import { Logo } from "@/public/index";

type Mode = "admin" | "store";
type StaffRole = "ADMIN" | "STORE" | "STORE_STAFF";
type BadgeKey = "newOrders" | "deliveries" | "restockRequests";

type NavigationItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: BadgeKey;
};

type Props = {
  mode: Mode;
  children: ReactNode;
  staffRole: StaffRole;
  staffName: string;
  staffEmail: string;
};

const adminNavigation: NavigationItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, badge: "newOrders" },
  { label: "Products", href: "/admin/products", icon: Boxes, badge: "restockRequests" },
  { label: "Customers", href: "/admin/customers", icon: ContactRound },
  { label: "Shipments", href: "/admin/shipments", icon: Truck },
  { label: "Analytics", href: "/admin/analytics", icon: ChartNoAxesCombined },
];

const storeManagerNavigation: NavigationItem[] = [
  { label: "Store Overview", href: "/store", icon: Warehouse },
  { label: "Order Queue", href: "/store/orders", icon: ClipboardList, badge: "newOrders" },
  { label: "Products", href: "/store/products", icon: Boxes, badge: "restockRequests" },
  { label: "Inventory", href: "/store/inventory", icon: SearchCheck },
  { label: "Shipments", href: "/store/shipments", icon: PackageOpen },
  { label: "Dispatch", href: "/store/dispatch", icon: PackageCheck },
];

const salesStaffNavigation: NavigationItem[] = [
  { label: "Sales Overview", href: "/store", icon: Warehouse },
  { label: "Inventory", href: "/store/inventory", icon: SearchCheck },
  { label: "Deliveries", href: "/store/deliveries", icon: Truck, badge: "deliveries" },
  { label: "Restock Alerts", href: "/store/restock", icon: AlertTriangle },
];

function AlertBadge({ count, dark = false }: { count: number; dark?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={[
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
        dark ? "bg-[var(--paper)] text-[var(--deep-green)]" : "bg-[var(--deep-green)] !text-soft-cream",
      ].join(" ")}
      aria-label={`${count} notifications`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function BackOfficeShell({
  mode,
  children,
  staffRole,
  staffName,
  staffEmail,
}: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { notifications } = useBackofficeNotifications();

  const navigation =
    mode === "admin"
      ? adminNavigation
      : staffRole === "STORE_STAFF"
        ? salesStaffNavigation
        : storeManagerNavigation;

  const title = mode === "admin" ? "Admin Office" : staffRole === "STORE_STAFF" ? "Sales & Delivery" : "Store Operations";
  const rootHref = mode === "admin" ? "/admin" : "/store";
  const staffRoleLabel =
    staffRole === "ADMIN"
      ? "STORE OWNER / ADMIN"
      : staffRole === "STORE"
        ? "STORE MANAGER"
        : "SALES STAFF";

  function countFor(item: NavigationItem) {
    return item.badge ? notifications[item.badge] : 0;
  }

  function isActive(href: string) {
    return pathname === href || (href !== rootHref && pathname.startsWith(`${href}/`));
  }

  function handleSignOut() {
    void signOut({ callbackUrl: "/" });
  }

  return (
    <div className="min-h-screen bg-[var(--paper-2)] text-[var(--ink)]">
      <header className="sticky top-0 z-50 border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href={rootHref} className="flex items-center gap-3">
            <Image src={Logo} alt="Decor by Kasiwa" width={160} height={80} priority className="h-auto w-[120px]" />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 text-[10px] font-medium uppercase tracking-[0.08em]"
          >
            <Menu size={18} strokeWidth={1.45} /> Menu
          </button>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--ink)] text-[var(--paper)] lg:hidden"
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="flex min-h-screen w-full flex-col px-5 pb-10 pt-5 sm:px-7">
              <div className="flex items-center justify-between pb-4">
                <div>
                  <span className="text-sm font-semibold tracking-[-0.04em]">DECOR BY KASIWA</span>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/45">{title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-[10px] uppercase tracking-[0.08em]"
                  aria-label="Close menu"
                >
                  Close <X size={14} />
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">{staffName}</p>
                <p className="mt-1 text-[11px] text-white/55">{staffEmail}</p>
                <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75">
                  {staffRoleLabel}
                </span>
              </div>

              <nav className="mt-8 flex-1">
                {navigation.map((item, index) => {
                  const active = isActive(item.href);
                  const count = countFor(item);
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, y: 28 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + index * 0.055 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="group flex items-center justify-between gap-4 py-3 text-[clamp(2rem,7vw,3.5rem)] font-medium leading-none tracking-[-0.06em]"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="relative inline-block origin-left transition-transform duration-300 ease-out group-hover:scale-[1.03]">
                            {item.label}
                            <span className={["absolute bottom-0 left-0 h-[2px] bg-[var(--paper-2)] transition-all duration-300", active ? "w-full" : "w-0 group-hover:w-full"].join(" ")} />
                          </span>
                          <AlertBadge count={count} dark />
                        </span>
                        <ArrowUpRight
                          size={22}
                          strokeWidth={1.3}
                          className="shrink-0 text-white/35 transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-white"
                        />
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>

              <div className="mt-10 border-t border-white/10 pt-5">
                <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">Switch workspace</p>
                <div className="grid gap-3 text-[11px] uppercase tracking-[0.08em] text-white">
                  <Link href="/" onClick={() => setMenuOpen(false)} className="transition-opacity hover:opacity-60">Customer site</Link>
                  {staffRole === "ADMIN" && mode === "admin" && <Link href="/store" onClick={() => setMenuOpen(false)} className="transition-opacity hover:opacity-60">Store operations</Link>}
                  {staffRole === "ADMIN" && mode === "store" && <Link href="/admin" onClick={() => setMenuOpen(false)} className="transition-opacity hover:opacity-60">Admin</Link>}
                </div>
                <button type="button" onClick={handleSignOut} className="mt-7 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-white/50 transition-colors hover:text-white">
                  <LogOut size={15} strokeWidth={1.4} /> Sign out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:grid lg:min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--ink)]/[0.09] bg-[var(--deep-green)] text-[var(--paper)] lg:block">
          <div className="sticky top-0 flex min-h-screen flex-col px-4 py-5">
            <Link href={rootHref} className="block pb-5">
              <Image src={Logo} alt="Decor by Kasiwa" width={260} height={130} priority className="h-auto w-[160px] brightness-0 invert" />
              <div className="mt-5 flex items-center gap-3">
                <span className="h-px w-7 bg-white/30" />
                <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/55">{title}</span>
              </div>
            </Link>

            <nav className="mt-8 flex-1" aria-label={`${title} navigation`}>
              {navigation.map((item) => {
                const active = isActive(item.href);
                const count = countFor(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "group relative flex items-center justify-between gap-3 py-3.5 text-[15px] transition-all duration-300",
                      active ? "text-white" : "text-white/48 hover:text-white",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon size={15} strokeWidth={1.35} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
                      <span className="relative whitespace-nowrap">
                        {item.label}
                        <span className={["absolute -bottom-1 left-0 h-[2px] transition-all duration-300 ease-out", active ? "w-full bg-white" : "w-0 bg-white/60 group-hover:w-full"].join(" ")} />
                      </span>
                      <AlertBadge count={count} dark />
                    </span>
                    <ArrowUpRight
                      size={14}
                      strokeWidth={1.35}
                      className="shrink-0 text-white/25 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/75"
                    />
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-white/15 pt-4">
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Switch workspace</p>
              <Link href="/" className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white">
                <ArrowLeft size={15} strokeWidth={1.4} className="transition-transform duration-300 group-hover:-translate-x-1" /> Customer site
              </Link>
              {staffRole === "ADMIN" && mode === "admin" && (
                <Link href="/store" className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white">
                  <Warehouse size={13} strokeWidth={1.4} /> Open store operations
                </Link>
              )}
              {staffRole === "ADMIN" && mode === "store" && (
                <Link href="/admin" className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white">
                  <LayoutDashboard size={13} strokeWidth={1.4} /> Open admin
                </Link>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <button type="button" className="group text-white/60 transition-all duration-300 hover:text-white" aria-label="Settings">
                  <Settings size={20} strokeWidth={1.3} className="transition-transform duration-300 group-hover:rotate-90" />
                </button>
                <button type="button" onClick={handleSignOut} className="group text-white/60 transition-all duration-300 hover:text-white" aria-label="Sign out">
                  <LogOut size={20} strokeWidth={1.3} className="transition-transform duration-300 group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="hidden min-h-[78px] items-center justify-between border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] px-5 sm:px-7 lg:flex lg:px-9">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Decor by Kasiwa</p>
              <p className="mt-1 text-[11px] font-medium">{title}</p>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="text-[11px] font-semibold text-[var(--ink)]">{staffName}</p>
                <p className="mt-0.5 text-[9px] text-[var(--muted)]">{staffEmail}</p>
                <span className="mt-1 inline-flex rounded-full bg-[var(--paper-2)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--deep-green)]">{staffRoleLabel}</span>
              </div>
              <span className="size-1.5 rounded-full bg-[var(--sage-green)]" title="Live operations" />
            </div>
          </header>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
