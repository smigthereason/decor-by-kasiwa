"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Heart, ShoppingBag, LockKeyhole, Trash2 } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney } from "@/lib/money";

export default function WishlistPage() {
  const { hydrated, catalogueReady, wishlist, toggleWishlist, addToCart, user, getProductById } = useCommerce();
  const products = wishlist.map(getProductById).filter(Boolean);

  if (!hydrated || !catalogueReady) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Preparing saved items…
          </p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
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
            <span>Your Private Edit</span>
          </div>
        </div>

        {/* EMPTY STATE CONTENT */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border hairline">
            <Heart size={20} strokeWidth={1.5} className="text-[var(--muted)]" />
          </div>
          <p className="kicker mt-6 text-[var(--muted)]">Saved Items</p>
          <h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">
            Your Edit Is Empty
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
            Build a collection of pieces you love. Explore furniture, lighting, textiles and décor, then save your favourites here.
          </p>
          <Link
            href="/shop"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3 hover:shadow-lg"
          >
            <span>Explore shop</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
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
          <span>Your Private Edit</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex w-full flex-1 flex-col">
        {/* PAGE HEADER */}
        <div className="border-b hairline px-4 py-6 md:px-8 lg:px-12">
          <p className="kicker text-[var(--muted)]">Saved Items</p>
          <h1 className="mt-2 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
            Your Edit
          </h1>
        </div>

        {!user && (
          <div className="border-b hairline px-4 py-4 md:px-8 lg:px-12">
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Items are currently saved on this device.{" "}
              <Link
                href="/account/register"
                className="font-medium text-[var(--ink)] underline underline-offset-4"
              >
                Create an account
              </Link>{" "}
              to sync your edit across devices.
            </p>
          </div>
        )}

        {/* PRODUCTS GRID */}
        <div className="flex-1 px-4 py-6 sm:px-6 md:px-8 lg:px-10 xl:px-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => product && (
              <article
                key={product.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
              >
                <Link
                  href={`/shop/${product.slug}`}
                  className="focus-ring block w-full text-left"
                >
                  {/* PRODUCT IMAGE */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-[var(--paper-2)]">
                    {product.heroImage ? (
                      <Image src={product.heroImage} alt={product.name} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center bg-[var(--warm-beige)] px-4 text-center">
                        <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--deep-green)]">Image coming soon</span>
                      </div>
                    )}

                    {/* CATEGORY BADGE */}
                    <span className="absolute left-3 top-3 rounded-full bg-[var(--paper)]/90 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--ink)] backdrop-blur-sm">
                      {product.category === "Decor" ? "Décor" : product.category}
                    </span>

                    {/* SAVED INDICATOR */}
                    <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-[var(--paper)]/90 backdrop-blur-sm">
                      <Heart size={14} className="text-[var(--ink)]" fill="currentColor" />
                    </span>
                  </div>

                  {/* PRODUCT DETAILS */}
                  <div className="flex flex-1 flex-col p-4 sm:p-5">
                    <h2 className="text-sm font-medium leading-snug tracking-[-0.02em] text-[var(--ink)] group-hover:underline group-hover:underline-offset-4">
                      {product.name}
                    </h2>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                      {product.description}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="text-sm font-semibold text-[var(--ink)]">
                        {formatMoney(product.price)}
                      </span>

                      {product.colours && product.colours.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {product.colours.slice(0, 3).map((colour) => (
                            <span
                              key={colour}
                              className="size-3 rounded-full border border-[var(--ink)]/10"
                              style={{ backgroundColor: colour.toLowerCase() }}
                              title={colour}
                            />
                          ))}
                          {product.colours.length > 3 && (
                            <span className="text-[9px] text-[var(--muted)]">
                              +{product.colours.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>

                {/* ACTION BUTTONS */}
                <div className="grid grid-cols-2 gap-2 border-t hairline p-4">
                  <button
                    type="button"
                    onClick={() => addToCart(product.id, 1, product.colours?.[0])}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:opacity-95"
                  >
                    <ShoppingBag size={12} />
                    <span>Add to Bag</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWishlist(product.id)}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-full border hairline px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-all hover:border-[var(--ink)] hover:text-[var(--ink)]"
                  >
                    <Trash2 size={12} />
                    <span>Remove</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* BOTTOM SPACER */}
        <div className="flex-1 bg-[var(--paper)]" />
      </div>

      {/* FOOTER NOTE */}
      <div className="border-t hairline px-4 py-6 md:px-8 lg:px-12">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {products.length} {products.length === 1 ? "Item" : "Items"} Saved
          </span>
          <Link
            href="/shop"
            className="focus-ring inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <span>Browse Collection</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
