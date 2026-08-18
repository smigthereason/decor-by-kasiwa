"use client";

import Link from "next/link";
import { ArrowRight, LogOut } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
import { formatMoney } from "@/lib/products";

export default function AccountPage() {
  const { hydrated, user, orders, wishlist, logout } = useCommerce();

  if (!hydrated) return <div className="grid min-h-[60vh] place-items-center">Loading account…</div>;

  if (!user) {
    return (
      <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Account</p>
        <h1 className="mt-5 text-[clamp(3.6rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">YOUR KASIWA.</h1>
        <p className="mt-7 max-w-xl text-sm leading-relaxed text-[var(--muted)]">Sign in to test the returning-customer journey, or create an account to see how saved items and prototype orders can live in one place.</p>
        <div className="mt-8 flex flex-wrap gap-2"><Link href="/account/login" className="rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Sign in</Link><Link href="/account/register" className="rounded-full border hairline px-5 py-3 text-[10px] uppercase tracking-[0.08em]">Create account</Link></div>
      </section>
    );
  }

  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="border-b hairline px-4 py-12 md:px-8 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div><p className="kicker text-[var(--muted)]">My account</p><h1 className="mt-4 text-[clamp(3.5rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">HELLO, {user.name.toUpperCase()}.</h1><p className="mt-4 text-sm text-[var(--muted)]">{user.email}</p></div>
          <button type="button" onClick={logout} className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-4 py-3 text-[10px] uppercase tracking-[0.08em]"><LogOut size={13}/> Sign out</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3">
        <Link href="/wishlist" className="group border-b border-r hairline p-5 md:p-8"><p className="kicker text-[var(--muted)]">Saved items</p><p className="mt-5 text-5xl font-medium tracking-[-0.06em]">{wishlist.length}</p><span className="mt-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]">View your edit <ArrowRight size={13} className="transition-transform group-hover:translate-x-1"/></span></Link>
        <div className="border-b border-r hairline p-5 md:p-8"><p className="kicker text-[var(--muted)]">Addresses</p><p className="mt-5 text-2xl font-medium tracking-[-0.04em]">Add address management when production authentication is connected.</p></div>
        <Link href="/consultation" className="group border-b hairline p-5 md:p-8"><p className="kicker text-[var(--muted)]">Design services</p><p className="mt-5 text-2xl font-medium tracking-[-0.04em]">Have a room or full project in mind?</p><span className="mt-8 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]">Book consultation <ArrowRight size={13}/></span></Link>
      </div>

      <div className="px-4 py-12 md:px-8 md:py-16">
        <p className="kicker text-[var(--muted)]">Prototype order history</p>
        <div className="mt-5 border-t hairline">
          {orders.length ? orders.map((order) => (
            <article key={order.id} className="grid gap-3 border-b hairline py-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center"><div><p className="text-sm font-medium">{order.id}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Date(order.createdAt).toLocaleDateString()}</p></div><span className="text-sm">{order.status}</span><span className="text-sm">{formatMoney(order.subtotal)}</span><span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">Prototype</span></article>
          )) : <div className="py-10 text-sm text-[var(--muted)]">No prototype orders yet.</div>}
        </div>
      </div>
    </section>
  );
}
