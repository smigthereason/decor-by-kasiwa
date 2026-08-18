"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, ShoppingBag } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
import { formatMoney, getProductById } from "@/lib/products";

export default function WishlistPage() {
  const { hydrated, wishlist, toggleWishlist, addToCart, user } = useCommerce();
  const products = wishlist.map(getProductById).filter(Boolean);

  if (!hydrated) return <div className="grid min-h-[60vh] place-items-center">Loading…</div>;

  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="border-b hairline px-4 py-12 md:px-8 md:py-16">
        <p className="kicker text-[var(--muted)]">Saved items</p>
        <h1 className="mt-5 text-[clamp(3.5rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">YOUR EDIT.</h1>
        {!user && <p className="mt-6 max-w-lg text-sm leading-relaxed text-[var(--muted)]">Items are currently saved on this device. <Link href="/account/register" className="text-[var(--ink)] underline underline-offset-4">Create an account</Link> as part of the prototype account journey.</p>}
      </div>

      {products.length ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => product && (
            <article key={product.id} className="border-b border-r hairline p-3">
              <Link href={`/shop/${product.slug}`} className="group block">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <Image src={product.heroImage} alt={product.name} fill className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                </div>
                <div className="mt-3 flex justify-between gap-4">
                  <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">{product.category}</p><h2 className="mt-1 text-sm font-medium">{product.name}</h2></div>
                  <span className="text-xs">{formatMoney(product.price)}</span>
                </div>
              </Link>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => addToCart(product.id, 1, product.colours[0])} className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-3 py-3 text-[9px] uppercase tracking-[0.08em] text-[var(--paper)]"><ShoppingBag size={12} /> Add to bag</button>
                <button type="button" onClick={() => toggleWishlist(product.id)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border hairline px-3 py-3 text-[9px] uppercase tracking-[0.08em]"><Heart size={12} fill="currentColor" /> Remove</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-[420px] place-items-center px-4 py-16 text-center">
          <div><p className="kicker text-[var(--muted)]">Nothing saved yet</p><h2 className="mt-4 text-4xl font-medium tracking-[-0.05em]">Build a collection of pieces you love.</h2><Link href="/shop" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Explore shop <ArrowRight size={13}/></Link></div>
        </div>
      )}
    </section>
  );
}
