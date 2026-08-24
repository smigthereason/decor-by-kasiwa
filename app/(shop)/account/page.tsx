"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole, LogOut, Heart, MapPin, Calendar, Package, ChevronRight, ShoppingBag, Sparkles } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney } from "@/lib/products";

export default function AccountPage() {
  const { hydrated, user, orders, wishlist, logout } = useCommerce();

  if (!hydrated) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Loading account…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col justify-center border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Account</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(3.8rem,9vw,8rem)] font-medium leading-[0.88] tracking-[-0.075em]">
          Your Account.
        </h1>
        <p className="mt-8 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
          Sign in to test the returning-customer journey, or create an account to see how saved items and prototype orders can live in one place.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href="/account/login"
            className="focus-ring group inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3 hover:shadow-lg"
          >
            <span>Sign in</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/account/register"
            className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
          >
            Create account
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* HEADER BAR */}
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/shop"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
          Continue shopping
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <LockKeyhole size={12} strokeWidth={1.5} />
          <span>My Account</span>
        </div>
      </div>

      {/* WELCOME HERO SECTION */}
      <div className="relative overflow-hidden border-b hairline bg-[var(--deep-green)] text-[var(--paper)]">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-soft-cream/5 to-transparent" />
        <div className="relative px-4 py-12 md:px-8 md:py-16 lg:px-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="kicker text-soft-cream/50">My Account</p>
              <h1 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
                Hello, {user.name.split(" ")[0]}
              </h1>
              <p className="mt-4 text-sm text-soft-cream/70">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-soft-cream/30 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-soft-cream transition-all hover:bg-soft-cream/10"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="border-b hairline bg-[var(--paper-2)]">
        <div className="grid grid-cols-3 divide-x hairline">
          <div className="p-4 text-center sm:p-6">
            <p className="text-2xl font-medium tracking-[-0.04em] sm:text-3xl">{wishlist.length}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Saved Items</p>
          </div>
          <div className="p-4 text-center sm:p-6">
            <p className="text-2xl font-medium tracking-[-0.04em] sm:text-3xl">{orders.length}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Orders</p>
          </div>
          <div className="p-4 text-center sm:p-6">
            <p className="text-2xl font-medium tracking-[-0.04em] sm:text-3xl">1</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Address</p>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 px-4 py-8 sm:px-6 md:px-8 lg:px-10 xl:px-12 lg:py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* LEFT COLUMN - QUICK ACTIONS */}
          <div className="space-y-4">
            <p className="kicker text-[var(--muted)]">Quick Actions</p>

            <Link
              href="/wishlist"
              className="group flex items-center gap-4 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--deep-green)] text-[var(--paper)]">
                <Heart size={18} strokeWidth={1.5} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Saved Items</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">View your curated edit</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/consultation"
              className="group flex items-center gap-4 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink)]">
                <Calendar size={18} strokeWidth={1.5} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Book Consultation</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Design services & styling</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/shop"
              className="group flex items-center gap-4 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-4 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg sm:p-5"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--paper-2)] text-[var(--ink)]">
                <ShoppingBag size={18} strokeWidth={1.5} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">Continue Shopping</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">Explore the collection</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-1" />
            </Link>

            <div className="rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <MapPin size={16} className="shrink-0 text-[var(--muted)]" />
                <p className="text-sm font-semibold">Addresses</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                Address management will be available when production authentication is connected.
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN - ORDER HISTORY */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="kicker text-[var(--muted)]">Order History</p>
              {orders.length > 0 && (
                <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                  {orders.length} {orders.length === 1 ? "Order" : "Orders"}
                </span>
              )}
            </div>

            {orders.length ? (
              <div className="mt-6 space-y-4">
                {orders.map((order) => (
                  <article
                    key={order.id}
                    className="group rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b hairline p-4 sm:p-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full bg-[var(--paper-2)]">
                          <Package size={16} className="text-[var(--muted)]" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{order.id}</p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {new Date(order.createdAt).toLocaleDateString("en-KE", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-[var(--paper-2)] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em]">
                        {order.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-xs text-[var(--muted)]">Total</p>
                          <p className="mt-1 text-lg font-semibold tracking-[-0.02em]">
                            {formatMoney(order.subtotal)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-[var(--muted)]" />
                        <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                          Prototype Order
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-lg border hairline bg-[var(--paper-2)] p-8 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--paper)]">
                  <Package size={24} className="text-[var(--muted)]" />
                </span>
                <p className="mt-4 text-sm font-medium">No orders yet</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  Your prototype order history will appear here once you've placed an order.
                </p>
                <Link
                  href="/shop"
                  className="focus-ring group mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
                >
                  <span>Start shopping</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
