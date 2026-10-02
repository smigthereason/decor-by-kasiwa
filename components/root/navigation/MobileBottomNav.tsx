"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Grid2X2, Heart, Home, ShoppingBag, UserRound } from "lucide-react";

import { getRoleHomePath } from "@/lib/auth/role-routing";

const staticItems = [
  { label: "Home", href: "/", Icon: Home },
  { label: "Shop", href: "/shop", Icon: ShoppingBag },
  { label: "Categories", href: "/#shop-by-category", Icon: Grid2X2 },
  { label: "Wishlist", href: "/wishlist", Icon: Heart },
] as const;

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname.startsWith("/checkout")) {
    return null;
  }

  const accountHref = getRoleHomePath(session?.user?.role, "/account");
  const profileImage = session?.user?.image || null;
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [profileImage]);
  const profileInitial = (session?.user?.email || session?.user?.name || "U").trim().charAt(0).toUpperCase();
  const accountLabel =
    session?.user?.role === "ADMIN"
      ? "Admin"
      : session?.user?.role === "STORE" || session?.user?.role === "STORE_STAFF"
        ? "Store"
        : "Account";

  const items = [
    ...staticItems,
    { label: accountLabel, href: accountHref, Icon: UserRound },
  ];

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t hairline bg-[var(--soft-cream)]/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-lg lg:hidden"
    >
      <div className="grid grid-cols-5">
        {items.map(({ label, href, Icon }) => {
          const active =
            label === "Home"
              ? pathname === "/"
              : label === "Shop"
                ? pathname.startsWith("/shop")
                : label === "Categories"
                  ? false
                  : pathname.startsWith(href.split("#")[0]);

          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className="focus-ring flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-1 text-[9px] font-medium"
            >
              {label === accountLabel && session?.user ? (
                <span className="relative grid size-[22px] place-items-center overflow-hidden rounded-full border border-[var(--brand-green)]/30 bg-[var(--paper)]">
                  {profileImage && !profileImageFailed ? (
                    <Image
                      src={profileImage}
                      alt=""
                      fill
                      sizes="22px"
                      className="object-cover"
                      unoptimized
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    <span className="text-[10px] font-semibold text-[var(--brand-green)]">{profileInitial}</span>
                  )}
                </span>
              ) : (
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.5}
                  className={active ? "text-[var(--brand-green)]" : "text-[var(--muted)]"}
                />
              )}
              <span className={active ? "text-[var(--brand-green)]" : "text-[var(--muted)]"}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
