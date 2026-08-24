"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Trash2, LockKeyhole } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney, getProductById } from "@/lib/products";

export default function CartPage() {
  const {
    hydrated,
    cart,
    subtotal,
    user,
    updateQuantity,
    removeFromCart,
  } = useCommerce();

  if (!hydrated) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Preparing bag…
          </p>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col justify-center border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Shopping bag</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(3.8rem,9vw,8rem)] font-medium leading-[0.88] tracking-[-0.075em]">
          YOUR BAG IS EMPTY.
        </h1>
        <p className="mt-8 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
          Explore furniture, lighting, textiles and décor, then return here when you are ready to curate your space.
        </p>
        <Link
          href="/shop"
          className="group mt-8 inline-flex items-center gap-2 self-start rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3 hover:shadow-lg"
        >
          <span>Return to collection</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
        </Link>
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
          <span>Secure Checkout</span>
        </div>
      </div>

      {/* TWO-COLUMN GRID */}
      <div className="grid flex-1 items-stretch lg:grid-cols-[1.3fr_0.7fr]">

        {/* LEFT COLUMN: CART ITEMS */}
        <div className="flex flex-col border-b hairline lg:border-b-0 lg:border-r">

          {/* CART HEADER */}
          <div className="border-b hairline px-4 py-6 md:px-8 lg:px-12">
            <p className="kicker text-[var(--muted)]">Shopping Bag</p>
            <h1 className="mt-2 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              Your Selection
            </h1>
          </div>

          {/* ITEMS LIST */}
          <div className="flex-1 px-4 py-6 sm:px-6 md:px-8 lg:px-10 xl:px-12">
            <div className="space-y-4">
              {cart.map((line) => {
                const product = getProductById(line.productId);
                if (!product) return null;

                return (
                  <article
                    key={`${line.productId}-${line.colour || "default"}`}
                    className="group flex flex-col sm:flex-row gap-4 sm:gap-6 rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] p-4 sm:p-5 transition-all hover:border-[var(--ink)]/30 hover:shadow-lg"
                  >
                    {/* PRODUCT IMAGE */}
                    <Link
                      href={`/shop/${product.slug}`}
                      className="relative aspect-[3/4] w-full sm:w-32 md:w-40 shrink-0 overflow-hidden rounded-lg bg-[var(--paper-2)]"
                    >
                      <Image
                        src={product.heroImage}
                        alt={product.name}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      />
                    </Link>

                    {/* PRODUCT DETAILS */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
                      <div className="flex justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                            {product.category === "Decor" ? "Décor" : product.category}
                          </p>
                          <Link
                            href={`/shop/${product.slug}`}
                            className="mt-1 block text-base sm:text-lg font-medium tracking-[-0.03em] hover:underline underline-offset-4"
                          >
                            {product.name}
                          </Link>
                          {line.colour && (
                            <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
                              Finish:
                              <span className="font-medium text-[var(--ink)]">{line.colour}</span>
                            </p>
                          )}
                        </div>
                        <p className="whitespace-nowrap text-base sm:text-lg font-semibold">
                          {formatMoney(product.price * line.quantity)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t hairline pt-4">
                        {/* QUANTITY CONTROLS */}
                        <div className="flex items-center rounded-full border hairline bg-[var(--paper)]">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                line.productId,
                                line.quantity - 1,
                                line.colour
                              )
                            }
                            className="focus-ring grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--paper-2)]"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="min-w-8 text-center text-sm font-medium">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                line.productId,
                                line.quantity + 1,
                                line.colour
                              )
                            }
                            className="focus-ring grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--paper-2)]"
                            aria-label="Increase quantity"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {/* UNIT PRICE */}
                        <div className="hidden sm:block text-xs text-[var(--muted)]">
                          {formatMoney(product.price)} each
                        </div>

                        {/* REMOVE BUTTON */}
                        <button
                          type="button"
                          onClick={() =>
                            removeFromCart(line.productId, line.colour)
                          }
                          className="focus-ring group/remove inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-red-600"
                        >
                          <Trash2 size={13} className="transition-transform group-hover/remove:scale-110" />
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* SPACER TO MAINTAIN FULL-HEIGHT DIVISION */}
          <div className="flex-1 bg-[var(--paper)]" />
        </div>

        {/* RIGHT COLUMN: SUMMARY ASIDE */}
        <div className="w-full bg-[var(--paper-2)]">
          <aside className="p-4 md:p-8 lg:sticky lg:top-[80px]">
            <div className="flex items-baseline justify-between border-b hairline pb-4">
              <div>
                <p className="kicker text-[var(--muted)]">Order Summary</p>

              </div>
              <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
                {String(cart.length).padStart(2, "0")} {cart.length === 1 ? "Item" : "Items"}
              </span>
            </div>

            {/* ITEM LIST */}
            <div className="divide-y hairline">
              {cart.map((line, index) => {
                const product = getProductById(line.productId);
                if (!product) return null;

                return (
                  <article
                    key={`${line.productId}-${line.colour || "default"}`}
                    className="flex items-start justify-between gap-4 py-4"
                  >
                    <div className="flex gap-3">
                      <span className="text-[10px] text-[var(--muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-sm font-medium leading-snug">{product.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Qty {line.quantity}
                          {line.colour ? ` · ${line.colour}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium whitespace-nowrap">
                      {formatMoney(product.price * line.quantity)}
                    </span>
                  </article>
                );
              })}
            </div>

            {/* SUBTOTAL & DELIVERY BREAKDOWN */}
            <div className="mt-6 border-y hairline py-5 text-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Delivery</span>
                <span className="text-[var(--muted)] text-xs">Calculated at checkout</span>
              </div>
            </div>

            {/* TOTAL HIGHLIGHT */}
            <div className="flex items-baseline justify-between py-6">
              <span className="text-xs uppercase tracking-[0.08em] font-medium">Total</span>
              <span className="text-3xl font-medium tracking-[-0.04em]">
                {formatMoney(subtotal)}
              </span>
            </div>

            {/* CHECKOUT BUTTON */}
            <Link
              href="/checkout"
              className="focus-ring group inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg hover:opacity-95"
            >
              <span>Continue to Checkout</span>
              <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
            </Link>

            {!user && (
              <div className="mt-5 border-t hairline pt-5 text-xs leading-relaxed text-[var(--muted)]">
                Have an account?{" "}
                <Link
                  href="/account/login?next=/checkout"
                  className="text-[var(--ink)] underline underline-offset-4"
                >
                  Sign in
                </Link>{" "}
                to make checkout faster. Guest checkout remains available.
              </div>
            )}

            {/* ADVISORY FOOTNOTE */}
            <div className="mt-5 border-t hairline pt-5 text-xs text-[var(--muted)] leading-relaxed space-y-2">
              <p className="font-medium text-[var(--ink)] uppercase tracking-[0.06em] text-[10px]">
                Fulfilment & Styling Note
              </p>
              <p>
                Delivery windows and custom freight quotes are finalized following address verification.
              </p>
            </div>

            {/* QUICK LINKS */}
            <div className="mt-5 grid gap-2 text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
              <Link href="/wishlist" className="underline underline-offset-4 transition-colors hover:text-[var(--ink)]">
                View saved items
              </Link>
              <Link href="/delivery" className="underline underline-offset-4 transition-colors hover:text-[var(--ink)]">
                Delivery information
              </Link>
              <Link href="/returns" className="underline underline-offset-4 transition-colors hover:text-[var(--ink)]">
                Returns information
              </Link>
            </div>
          </aside>
        </div>

      </div>
    </section>
  );
}
