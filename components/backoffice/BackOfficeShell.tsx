// "use client";

// import Image from "next/image";
// import Link from "next/link";
// import { usePathname } from "next/navigation";
// import type { ReactNode } from "react";
// import { useState } from "react";
// import { AnimatePresence, motion } from "framer-motion";
// import {
//   ArrowLeft,
//   Boxes,
//   ChartNoAxesCombined,
//   ClipboardList,
//   ContactRound,
//   LayoutDashboard,
//   LogOut,
//   Menu,
//   PackageCheck,
//   PackageOpen,
//   Settings,
//   ShoppingBag,
//   Truck,
//   Warehouse,
//   X,
// } from "lucide-react";

// import { signOut } from "next-auth/react";

// import { Logo } from "@/public/index";

// type Mode = "admin" | "store";

// type StaffRole = "ADMIN" | "STORE";

// type Props = {
//   mode: Mode;
//   children: ReactNode;

//   staffRole: StaffRole;
//   staffName: string;
//   staffEmail: string;
// };

// const adminNavigation = [
//   ["Overview", "/admin", LayoutDashboard],
//   ["Orders", "/admin/orders", ShoppingBag],
//   ["Products ", "/admin/products", Boxes],
//   ["Customers", "/admin/customers", ContactRound],
//   ["Shipments", "/admin/shipments", Truck],
//   ["Analytics", "/admin/analytics", ChartNoAxesCombined],
// ] as const;

// const storeNavigation = [
//   ["Store Overview", "/store", Warehouse],
//   ["Order Queue", "/store/orders", ClipboardList],
//   ["Shipments", "/store/shipments", PackageOpen],
//   ["Inventory", "/store/inventory", Boxes],
//   ["Dispatch", "/store/dispatch", PackageCheck],
// ] as const;

// export default function BackOfficeShell({
//   mode,
//   children,
//   staffRole,
//   staffName,
//   staffEmail,
// }: Props) {
//   const pathname = usePathname();
//   const [menuOpen, setMenuOpen] = useState(false);
//   const navigation = mode === "admin" ? adminNavigation : storeNavigation;
//   const title = mode === "admin" ? "Admin Office" : "Store Operations";
//   const rootHref = mode === "admin" ? "/admin" : "/store";

//   return (
//     <div className="min-h-screen bg-[var(--paper-2)] text-[var(--ink)]">
//       {/* MOBILE HEADER */}
//       <header className="sticky top-0 z-50 border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] lg:hidden">
//         <div className="flex items-center justify-between px-4 py-4">
//           <Link href={rootHref} className="flex items-center gap-3">
//             <Image
//               src={Logo}
//               alt="Decor by Kasiwa"
//               width={160}
//               height={80}
//               priority
//               className="h-auto w-[120px]"
//             />
//           </Link>

//           <button
//             type="button"
//             onClick={() => setMenuOpen(true)}
//             aria-label="Open menu"
//             className="group inline-flex h-10 items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 text-[10px] font-medium uppercase tracking-[0.08em]"
//           >
//             <Menu size={18} strokeWidth={1.45} />
//             Menu
//           </button>
//         </div>
//       </header>

//       {/* MOBILE FULL SCREEN MENU */}
//       <AnimatePresence>
//         {menuOpen && (
//           <motion.div
//             className="fixed inset-0 z-[60] overflow-y-auto bg-[var(--ink)] text-[var(--paper)] lg:hidden"
//             initial={{ y: "-100%" }}
//             animate={{ y: 0 }}
//             exit={{ y: "-100%" }}
//             transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
//           >
//             <div className="flex min-h-screen w-full flex-col px-4 pb-10 pt-5">
//               {/* MENU HEADER */}
//               <div className="flex items-center justify-between pb-4">
//                 <span className="text-sm font-semibold tracking-[-0.04em]">
//                   DECOR BY KASIWA
//                 </span>
//                 <button
//                   type="button"
//                   onClick={() => setMenuOpen(false)}
//                   className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-[10px] uppercase tracking-[0.08em]"
//                   aria-label="Close menu"
//                 >
//                   Close
//                   <X size={14} />
//                 </button>
//               </div>

//               {/* NAVIGATION */}
//               <nav className="mt-8 flex-1">
//                 {navigation.map(([label, href, Icon], index) => {
//                   const active =
//                     pathname === href ||
//                     (href !== rootHref && pathname.startsWith(`${href}/`));

//                   return (
//                     <motion.div
//                       key={href}
//                       initial={{ opacity: 0, y: 28 }}
//                       animate={{ opacity: 1, y: 0 }}
//                       transition={{ delay: 0.08 + index * 0.055 }}
//                     >
//                       <Link
//                         href={href}
//                         onClick={() => setMenuOpen(false)}
//                         className="group flex items-center justify-between py-3 text-[clamp(2rem,7vw,3.5rem)] font-medium leading-none tracking-[-0.06em]"
//                       >
//                         <span className="relative inline-block transition-transform duration-300 ease-out origin-left group-hover:scale-[1.03]">
//                           {label}
//                           <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[var(--paper-2)] transition-all duration-300 ease-out group-hover:w-full" />
//                         </span>
//                       </Link>
//                     </motion.div>
//                   );
//                 })}
//               </nav>

//               {/* MENU FOOTER */}
//               <div className="mt-10 grid gap-6 border-t border-white/10 pt-5 text-xs text-white/55">
//                 <div className="flex flex-wrap gap-x-5 gap-y-3 text-[10px] uppercase tracking-[0.08em] text-white">
//                   <Link href="/" onClick={() => setMenuOpen(false)}>
//                     Customer site
//                   </Link>
//                   {staffRole === "ADMIN" &&
//                     mode === "admin" && (
//                       <Link
//                         href="/store"
//                         onClick={() =>
//                           setMenuOpen(false)
//                         }
//                       >
//                         Store operations
//                       </Link>
//                     )}

//                   {staffRole === "ADMIN" &&
//                     mode === "store" && (
//                       <Link
//                         href="/admin"
//                         onClick={() =>
//                           setMenuOpen(false)
//                         }
//                       >
//                         Admin
//                       </Link>
//                     )}
//                 </div>
//               </div>
//             </div>
//           </motion.div>
//         )}
//       </AnimatePresence>

//       {/* DESKTOP LAYOUT */}
//       <div className="lg:grid lg:min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">
//         {/* SIDEBAR - HIDDEN ON MOBILE */}
//         <aside className="hidden border-r border-[var(--ink)]/[0.09] bg-[var(--deep-green)] text-[var(--paper)] lg:block">
//           <div className="sticky top-0 flex min-h-screen flex-col px-4 py-5">
//             <Link href={rootHref} className="block pb-5">
//               <Image
//                 src={Logo}
//                 alt="Decor by Kasiwa"
//                 width={260}
//                 height={130}
//                 priority
//                 className="h-auto w-[160px] brightness-0 invert"
//               />

//               <div className="mt-5 flex items-center gap-3">
//                 <span className="h-px w-7 bg-white/30" />
//                 <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/55">
//                   {title}
//                 </span>
//               </div>
//             </Link>

//             {/* DESKTOP SIDEBAR NAVIGATION */}
//             <nav className="mt-8 flex-1" aria-label={`${title} navigation`}>
//               {navigation.map(([label, href, Icon], index) => {
//                 const active =
//                   pathname === href ||
//                   (href !== rootHref && pathname.startsWith(`${href}/`));

//                 return (
//                   <Link
//                     key={href}
//                     href={href}
//                     className={[
//                       "group relative flex items-center justify-between py-3.5",
//                       "text-[16px] transition-all duration-300",
//                       active ? "text-white" : "text-white/48 hover:text-white",
//                     ].join(" ")}
//                   >
//                     <span className="flex items-center gap-3">
//                       <Icon
//                         size={15}
//                         strokeWidth={1.35}
//                         className="transition-transform duration-300 group-hover:scale-110"
//                       />
//                       <span className="relative">
//                         {label}
//                         <span
//                           className={[
//                             "absolute -bottom-1 left-0 h-[2px] transition-all duration-300 ease-out",
//                             active
//                               ? "w-full bg-white"
//                               : "w-0 bg-white/60 group-hover:w-full",
//                           ].join(" ")}
//                         />
//                       </span>
//                     </span>
//                     <span className="text-[10px] tracking-[0.12em] text-white/25 transition-colors duration-300 group-hover:text-white/50">
//                       {String(index + 1).padStart(2, "0")}
//                     </span>
//                   </Link>
//                 );
//               })}
//             </nav>

//             {/* FOOTER LINKS */}
//             <div className="border-t border-white/15 pt-4">
//               <Link
//                 href="/"
//                 className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white"
//               >
//                 <ArrowLeft
//                   size={15}
//                   strokeWidth={1.4}
//                   className="transition-transform duration-300 group-hover:-translate-x-1"
//                 />
//                 <span className="relative">
//                   Customer site
//                   <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
//                 </span>
//               </Link>

//               {staffRole === "ADMIN" &&
//                 mode === "admin" && (
//                 <Link
//                   href="/store"
//                   className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white"
//                 >
//                   <Warehouse
//                     size={13}
//                     strokeWidth={1.4}
//                     className="transition-transform duration-300 group-hover:scale-110"
//                   />
//                   <span className="relative">
//                     Open store operations
//                     <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
//                   </span>
//                 </Link>
//               )}

//               {staffRole === "ADMIN" &&
//                 mode === "store" && (
//                 <Link
//                   href="/admin"
//                   className="group flex items-center gap-3 py-2 text-[12px] uppercase tracking-[0.12em] text-white/50 transition-all duration-300 hover:text-white"
//                 >
//                   <LayoutDashboard
//                     size={13}
//                     strokeWidth={1.4}
//                     className="transition-transform duration-300 group-hover:scale-110"
//                   />
//                   <span className="relative">
//                     Open admin
//                     <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
//                   </span>
//                 </Link>
//               )}

//               <div className="mt-4 flex items-center justify-between pt-4">
//                 <button
//                   type="button"
//                   className="group text-white/60 transition-all duration-300 hover:text-white"
//                   aria-label="Settings"
//                 >
//                   <Settings
//                     size={20}
//                     strokeWidth={1.3}
//                     className="transition-transform duration-300 group-hover:rotate-90"
//                   />
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() =>
//                     void signOut({
//                       callbackUrl: "/",
//                     })
//                   }
//                   className="group text-white/60 transition-all duration-300 hover:text-white"
//                   aria-label="Sign out"
//                 >
//                   <LogOut
//                     size={20}
//                     strokeWidth={1.3}
//                     className="transition-transform duration-300 group-hover:translate-x-1"
//                   />
//                 </button>
//               </div>
//             </div>
//           </div>
//         </aside>

//         {/* MAIN CONTENT - VISIBLE ON ALL SCREEN SIZES */}
//         <div className="min-w-0">
//           <header className="hidden lg:flex min-h-[78px] items-center justify-between border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] px-5 sm:px-7 lg:px-9">
//             <div>
//               <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
//                 Decor by Kasiwa
//               </p>

//               <p className="mt-1 text-[11px] font-medium">
//                 {title}
//               </p>
//             </div>

//             <div className="text-right">
//               <p className="text-[11px] font-semibold text-[var(--ink)]">
//                 {staffName}
//               </p>

//               <p className="mt-0.5 text-[9px] text-[var(--muted)]">
//                 {staffEmail}
//               </p>

//               <span className="mt-1 inline-flex rounded-full bg-[var(--paper-2)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--deep-green)]">
//                 {staffRole}
//               </span>
//             </div>

//             <div className="flex items-center gap-3">
//               <span className="hidden text-[8px] uppercase tracking-[0.12em] text-[var(--muted)] sm:inline">
//                 Live operations
//               </span>
//               <span className="size-1.5 rounded-full bg-[var(--sage-green)]" />
//               <div className="grid size-9 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper-2)] text-[10px] font-semibold">
//                 DK
//               </div>
//             </div>
//           </header>

//           {/* THIS IS THE KEY FIX - main is now outside the hidden containers */}
//           <main>{children}</main>
//         </div>
//       </div>
//     </div>
//   );
// }
"use client";

import Image from "next/image";
import Link from "next/link";
import {
  usePathname,
} from "next/navigation";

import type {
  ReactNode,
} from "react";

import {
  useState,
} from "react";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  ArrowLeft,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PackageOpen,
  Settings,
  ShoppingBag,
  Truck,
  Warehouse,
  X,
} from "lucide-react";

import {
  signOut,
} from "next-auth/react";

import {
  Logo,
} from "@/public/index";

type Mode =
  | "admin"
  | "store";

type StaffRole =
  | "ADMIN"
  | "STORE";

type Props = {
  mode: Mode;

  children: ReactNode;

  staffRole: StaffRole;

  staffName: string;

  staffEmail: string;
};

const adminNavigation = [
  [
    "Overview",
    "/admin",
    LayoutDashboard,
  ],

  [
    "Orders",
    "/admin/orders",
    ShoppingBag,
  ],

  [
    "Products",
    "/admin/products",
    Boxes,
  ],

  [
    "Customers",
    "/admin/customers",
    ContactRound,
  ],

  [
    "Shipments",
    "/admin/shipments",
    Truck,
  ],

  [
    "Analytics",
    "/admin/analytics",
    ChartNoAxesCombined,
  ],
] as const;

const storeNavigation = [
  [
    "Store Overview",
    "/store",
    Warehouse,
  ],

  [
    "Order Queue",
    "/store/orders",
    ClipboardList,
  ],

  [
    "Shipments",
    "/store/shipments",
    PackageOpen,
  ],

  [
    "Inventory",
    "/store/inventory",
    Boxes,
  ],

  [
    "Dispatch",
    "/store/dispatch",
    PackageCheck,
  ],
] as const;

export default function BackOfficeShell({
  mode,
  children,
  staffRole,
  staffName,
  staffEmail,
}: Props) {
  const pathname =
    usePathname();

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const navigation =
    mode === "admin"
      ? adminNavigation
      : storeNavigation;

  const title =
    mode === "admin"
      ? "Admin Office"
      : "Store Operations";

  const rootHref =
    mode === "admin"
      ? "/admin"
      : "/store";

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleSignOut() {
    void signOut({
      callbackUrl: "/",
    });
  }

  return (
    <div className="min-h-screen bg-[var(--paper-2)] text-[var(--ink)]">

      {/* ================================================================ */}
      {/* MOBILE HEADER                                                    */}
      {/* ================================================================ */}

      <header className="sticky top-0 z-50 border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-4">
          <Link
            href={rootHref}
            className="flex items-center gap-3"
          >
            <Image
              src={Logo}
              alt="Decor by Kasiwa"
              width={160}
              height={80}
              priority
              className="h-auto w-[120px]"
            />
          </Link>

          <button
            type="button"
            onClick={() =>
              setMenuOpen(true)
            }
            aria-label="Open menu"
            className="
              group
              inline-flex h-10
              items-center gap-2
              rounded-full
              bg-[var(--paper-2)]
              px-4
              text-[10px]
              font-medium
              uppercase
              tracking-[0.08em]
            "
          >
            <Menu
              size={18}
              strokeWidth={1.45}
            />

            Menu
          </button>
        </div>
      </header>

      {/* ================================================================ */}
      {/* MOBILE FULL SCREEN MENU                                          */}
      {/* ================================================================ */}

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="
              fixed inset-0
              z-[60]
              overflow-y-auto
              bg-[var(--ink)]
              text-[var(--paper)]
              lg:hidden
            "
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
              duration: 0.45,
              ease: [
                0.76,
                0,
                0.24,
                1,
              ],
            }}
          >
            <div className="flex min-h-screen w-full flex-col px-5 pb-10 pt-5 sm:px-7">

              {/* MENU HEADER */}

              <div className="flex items-center justify-between pb-4">
                <div>
                  <span className="text-sm font-semibold tracking-[-0.04em]">
                    DECOR BY KASIWA
                  </span>

                  <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-white/45">
                    {title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeMenu
                  }
                  className="
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    border-white/20
                    px-3
                    py-2
                    text-[10px]
                    uppercase
                    tracking-[0.08em]
                  "
                  aria-label="Close menu"
                >
                  Close

                  <X
                    size={14}
                  />
                </button>
              </div>

              {/* STAFF DETAILS */}

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">
                  {staffName}
                </p>

                <p className="mt-1 text-[11px] text-white/55">
                  {staffEmail}
                </p>

                <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75">
                  {staffRole}
                </span>
              </div>

              {/* NAVIGATION */}

              <nav className="mt-8 flex-1">
                {navigation.map(
                  (
                    [
                      label,
                      href,
                      Icon,
                    ],
                    index,
                  ) => {
                    const active =
                      pathname ===
                        href ||
                      (href !==
                        rootHref &&
                        pathname.startsWith(
                          `${href}/`,
                        ));

                    return (
                      <motion.div
                        key={
                          href
                        }
                        initial={{
                          opacity: 0,
                          y: 28,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        transition={{
                          delay:
                            0.08 +
                            index *
                              0.055,
                        }}
                      >
                        <Link
                          href={
                            href
                          }
                          onClick={
                            closeMenu
                          }
                          className="
                            group
                            flex
                            items-center
                            justify-between
                            py-3
                            text-[clamp(2rem,7vw,3.5rem)]
                            font-medium
                            leading-none
                            tracking-[-0.06em]
                          "
                        >
                          <span className="relative inline-block origin-left transition-transform duration-300 ease-out group-hover:scale-[1.03]">
                            {
                              label
                            }

                            <span
                              className={[
                                "absolute bottom-0 left-0 h-[2px]",
                                "bg-[var(--paper-2)]",
                                "transition-all duration-300 ease-out",
                                active
                                  ? "w-full"
                                  : "w-0 group-hover:w-full",
                              ].join(
                                " ",
                              )}
                            />
                          </span>

                          <Icon
                            size={
                              20
                            }
                            strokeWidth={
                              1.3
                            }
                            className={
                              active
                                ? "text-white"
                                : "text-white/30"
                            }
                          />
                        </Link>
                      </motion.div>
                    );
                  },
                )}
              </nav>

              {/* CROSS-WORKSPACE LINKS */}

              <div className="mt-10 border-t border-white/10 pt-5">
                <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Switch workspace
                </p>

                <div className="grid gap-3 text-[11px] uppercase tracking-[0.08em] text-white">

                  {/* Every authenticated staff user may visit customer site */}

                  <Link
                    href="/"
                    onClick={
                      closeMenu
                    }
                    className="transition-opacity hover:opacity-60"
                  >
                    Customer site
                  </Link>

                  {/* ONLY ADMIN can navigate from Admin -> Store */}

                  {staffRole ===
                    "ADMIN" &&
                    mode ===
                      "admin" && (
                      <Link
                        href="/store"
                        onClick={
                          closeMenu
                        }
                        className="transition-opacity hover:opacity-60"
                      >
                        Store
                        operations
                      </Link>
                    )}

                  {/* ONLY ADMIN can navigate from Store -> Admin */}

                  {staffRole ===
                    "ADMIN" &&
                    mode ===
                      "store" && (
                      <Link
                        href="/admin"
                        onClick={
                          closeMenu
                        }
                        className="transition-opacity hover:opacity-60"
                      >
                        Admin
                      </Link>
                    )}
                </div>

                <button
                  type="button"
                  onClick={
                    handleSignOut
                  }
                  className="
                    mt-7
                    inline-flex
                    items-center
                    gap-2
                    text-[10px]
                    uppercase
                    tracking-[0.1em]
                    text-white/50
                    transition-colors
                    hover:text-white
                  "
                >
                  <LogOut
                    size={15}
                    strokeWidth={
                      1.4
                    }
                  />

                  Sign out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* DESKTOP LAYOUT                                                    */}
      {/* ================================================================ */}

      <div className="lg:grid lg:min-h-screen lg:grid-cols-[248px_minmax(0,1fr)]">

        {/* =============================================================== */}
        {/* SIDEBAR                                                         */}
        {/* =============================================================== */}

        <aside className="hidden border-r border-[var(--ink)]/[0.09] bg-[var(--deep-green)] text-[var(--paper)] lg:block">
          <div className="sticky top-0 flex min-h-screen flex-col px-4 py-5">

            <Link
              href={rootHref}
              className="block pb-5"
            >
              <Image
                src={Logo}
                alt="Decor by Kasiwa"
                width={260}
                height={130}
                priority
                className="h-auto w-[160px] brightness-0 invert"
              />

              <div className="mt-5 flex items-center gap-3">
                <span className="h-px w-7 bg-white/30" />

                <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/55">
                  {title}
                </span>
              </div>
            </Link>

            {/* NAVIGATION */}

            <nav
              className="mt-8 flex-1"
              aria-label={`${title} navigation`}
            >
              {navigation.map(
                (
                  [
                    label,
                    href,
                    Icon,
                  ],
                  index,
                ) => {
                  const active =
                    pathname ===
                      href ||
                    (href !==
                      rootHref &&
                      pathname.startsWith(
                        `${href}/`,
                      ));

                  return (
                    <Link
                      key={href}
                      href={href}
                      className={[
                        "group relative flex items-center justify-between py-3.5",
                        "text-[16px] transition-all duration-300",
                        active
                          ? "text-white"
                          : "text-white/48 hover:text-white",
                      ].join(
                        " ",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          size={
                            15
                          }
                          strokeWidth={
                            1.35
                          }
                          className="transition-transform duration-300 group-hover:scale-110"
                        />

                        <span className="relative">
                          {
                            label
                          }

                          <span
                            className={[
                              "absolute -bottom-1 left-0 h-[2px]",
                              "transition-all duration-300 ease-out",
                              active
                                ? "w-full bg-white"
                                : "w-0 bg-white/60 group-hover:w-full",
                            ].join(
                              " ",
                            )}
                          />
                        </span>
                      </span>

                      <span className="text-[10px] tracking-[0.12em] text-white/25 transition-colors duration-300 group-hover:text-white/50">
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          "0",
                        )}
                      </span>
                    </Link>
                  );
                },
              )}
            </nav>

            {/* =========================================================== */}
            {/* STAFF / WORKSPACE FOOTER                                    */}
            {/* =========================================================== */}

            <div className="border-t border-white/15 pt-4">

              <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">
                Switch workspace
              </p>

              {/* CUSTOMER SITE - ADMIN AND STORE */}

              <Link
                href="/"
                className="
                  group
                  flex
                  items-center
                  gap-3
                  py-2
                  text-[12px]
                  uppercase
                  tracking-[0.12em]
                  text-white/50
                  transition-all
                  duration-300
                  hover:text-white
                "
              >
                <ArrowLeft
                  size={15}
                  strokeWidth={
                    1.4
                  }
                  className="transition-transform duration-300 group-hover:-translate-x-1"
                />

                <span className="relative">
                  Customer site

                  <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
                </span>
              </Link>

              {/* ADMIN ONLY: ADMIN -> STORE */}

              {staffRole ===
                "ADMIN" &&
                mode ===
                  "admin" && (
                  <Link
                    href="/store"
                    className="
                      group
                      flex
                      items-center
                      gap-3
                      py-2
                      text-[12px]
                      uppercase
                      tracking-[0.12em]
                      text-white/50
                      transition-all
                      duration-300
                      hover:text-white
                    "
                  >
                    <Warehouse
                      size={
                        13
                      }
                      strokeWidth={
                        1.4
                      }
                      className="transition-transform duration-300 group-hover:scale-110"
                    />

                    <span className="relative">
                      Open
                      store
                      operations

                      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
                    </span>
                  </Link>
                )}

              {/* ADMIN ONLY: STORE -> ADMIN */}

              {staffRole ===
                "ADMIN" &&
                mode ===
                  "store" && (
                  <Link
                    href="/admin"
                    className="
                      group
                      flex
                      items-center
                      gap-3
                      py-2
                      text-[12px]
                      uppercase
                      tracking-[0.12em]
                      text-white/50
                      transition-all
                      duration-300
                      hover:text-white
                    "
                  >
                    <LayoutDashboard
                      size={
                        13
                      }
                      strokeWidth={
                        1.4
                      }
                      className="transition-transform duration-300 group-hover:scale-110"
                    />

                    <span className="relative">
                      Open
                      admin

                      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-white/60 transition-all duration-300 group-hover:w-full" />
                    </span>
                  </Link>
                )}

              {/* SETTINGS / LOGOUT */}

              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                <button
                  type="button"
                  className="group text-white/60 transition-all duration-300 hover:text-white"
                  aria-label="Settings"
                >
                  <Settings
                    size={20}
                    strokeWidth={
                      1.3
                    }
                    className="transition-transform duration-300 group-hover:rotate-90"
                  />
                </button>

                <button
                  type="button"
                  onClick={
                    handleSignOut
                  }
                  className="group text-white/60 transition-all duration-300 hover:text-white"
                  aria-label="Sign out"
                >
                  <LogOut
                    size={20}
                    strokeWidth={
                      1.3
                    }
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* =============================================================== */}
        {/* MAIN CONTENT                                                     */}
        {/* =============================================================== */}

        <div className="min-w-0">

          {/* DESKTOP HEADER */}

          <header className="hidden min-h-[78px] items-center justify-between border-b border-[var(--ink)]/[0.09] bg-[var(--paper)] px-5 sm:px-7 lg:flex lg:px-9">

            {/* CURRENT WORKSPACE */}

            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                Decor by Kasiwa
              </p>

              <p className="mt-1 text-[11px] font-medium">
                {title}
              </p>
            </div>

            {/* USER IDENTITY */}

            <div className="flex items-center gap-5">

              <div className="text-right">
                <p className="text-[11px] font-semibold text-[var(--ink)]">
                  {staffName}
                </p>

                <p className="mt-0.5 text-[9px] text-[var(--muted)]">
                  {staffEmail}
                </p>

                <span className="mt-1 inline-flex rounded-full bg-[var(--paper-2)] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--deep-green)]">
                  {staffRole}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-[8px] uppercase tracking-[0.12em] text-[var(--muted)] xl:inline">
                  Live
                  operations
                </span>

                <span className="size-1.5 rounded-full bg-[var(--sage-green)]" />

                <div className="grid size-9 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper-2)] text-[10px] font-semibold uppercase">
                  {staffName
                    .split(
                      " ",
                    )
                    .filter(
                      Boolean,
                    )
                    .slice(
                      0,
                      2,
                    )
                    .map(
                      (
                        name,
                      ) =>
                        name[0],
                    )
                    .join(
                      "",
                    )}
                </div>
              </div>
            </div>
          </header>

          <main>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
