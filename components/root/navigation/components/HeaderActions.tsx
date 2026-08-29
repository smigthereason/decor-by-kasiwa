"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { CircleUserRound, Heart, ShoppingBag } from "lucide-react";

import { getRoleHomePath } from "@/lib/auth/role-routing";

interface HeaderActionsProps {
  user: { name: string } | null;
  wishlist: unknown[];
  cartCount: number;
}

export function HeaderActions({ user, wishlist, cartCount }: HeaderActionsProps) {
  const { data: session } = useSession();

  const accountHref = user
    ? getRoleHomePath(session?.user?.role, "/account")
    : "/account";

  const accountLabel =
    session?.user?.role === "ADMIN"
      ? "Open Admin workspace"
      : session?.user?.role === "STORE" || session?.user?.role === "STORE_STAFF"
        ? "Open Store workspace"
        : user
          ? "Open my account"
          : "Sign in";

  return (
    <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-1.5">
      {/* Desktop Account */}
      <Link
        href={accountHref}
        aria-label={accountLabel}
        className="hidden h-10 items-center gap-2 rounded-full border border-white/10 bg-white/10 pl-3 pr-1.5 text-[10px] font-medium text-white transition-transform hover:scale-[1.02] lg:inline-flex"
      >
        <span className="max-w-20 truncate">
          {user ? user.name.split(" ")[0] : "Sign in"}
        </span>
        <span className="grid size-7.5 place-items-center rounded-full bg-[var(--soft-cream)] text-[var(--deep-green)]">
          <CircleUserRound size={20} strokeWidth={1.1} />
        </span>
      </Link>

      {/* Wishlist */}
      <Link
        href="/wishlist"
        aria-label="Open saved items"
        className="relative grid size-[34px] place-items-center rounded-full bg-white/10 text-white transition-transform hover:scale-[1.05] sm:size-10"
      >
        <Heart size={18} strokeWidth={1.45} className="sm:h-5 sm:w-5" />
        {wishlist.length > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--brand-gold)] px-1 text-[9px] font-semibold leading-none text-[var(--deep-green)] sm:-right-2 sm:-top-0.5 sm:text-[10px]">
            {wishlist.length > 99 ? "99+" : wishlist.length}
          </span>
        )}
      </Link>

      {/* Cart */}
      <Link
        href="/cart"
        aria-label="Open shopping bag"
        className="relative grid size-[34px] place-items-center rounded-full bg-white/10 text-white transition-transform hover:scale-[1.05] sm:size-10"
      >
        <ShoppingBag size={18} strokeWidth={1.45} className="sm:h-5 sm:w-5" />
        {cartCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-[15px] min-w-[15px] place-items-center rounded-full bg-[var(--brand-gold)] px-1 text-[9px] font-semibold leading-none text-[var(--deep-green)] sm:-right-2 sm:-top-0.5 sm:text-[10px]">
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </Link>

      {/* Mobile Profile */}
      <Link
        href={accountHref}
        aria-label={user ? `${accountLabel} — signed in as ${user.name}` : "Sign in or create account"}
        title={user ? `Signed in as ${user.name}` : "Sign in"}
        className={[
          "relative grid size-[34px] place-items-center",
          "rounded-full transition-all hover:scale-[1.05]",
          "sm:size-10",
          "lg:hidden",
          user
            ? "bg-[var(--soft-cream)] text-[var(--deep-green)]"
            : "bg-white/10 text-white",
        ].join(" ")}
      >
        <CircleUserRound size={19} strokeWidth={1.35} className="sm:h-5 sm:w-5" />
        {user && (
          <span
            aria-hidden="true"
            className="absolute bottom-[1px] right-[1px] size-[8px] rounded-full border-2 border-[var(--deep-green)] bg-[var(--soft-cream)] sm:bottom-[2px] sm:right-[2px]"
          />
        )}
      </Link>
    </div>
  );
}