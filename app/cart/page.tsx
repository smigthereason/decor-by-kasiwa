"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
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
      <div className="grid min-h-[60vh] place-items-center text-xs uppercase tracking-[0.08em]">
        Loading bag…
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col justify-center border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Shopping bag</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(3.8rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">
          YOUR BAG IS EMPTY.
        </h1>
        <p className="mt-8 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
          Explore furniture, lighting, textiles and décor, then return here when
          you are ready to continue.
        </p>
        <Link
          href="/shop"
          className="mt-8 inline-flex items-center gap-2 self-start rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white"
        >
          <span>Continue shopping</span> <ArrowRight size={14} />
        </Link>
      </section>
    );
  }

  return (
    <section className="flex h-full w-full flex-col border-b hairline bg-[var(--paper)]">
      {/* HEADER SECTION */}
      <div className="border-b hairline px-4 py-8 md:px-8 md:py-12">
        <Link
          href="/shop"
          className="focus-ring inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} /> Continue shopping
        </Link>
        <h1 className="mt-4 text-[clamp(2.8rem,7vw,7rem)] font-medium leading-[0.88] tracking-[-0.075em]">
          SHOPPING BAG
        </h1>
      </div>

      {/* MAIN TWO-COLUMN CONTENT GRID */}
      <div className="grid flex-1 items-stretch lg:grid-cols-[1.3fr_0.7fr]">
        {/* LEFT COLUMN: CART ITEMS */}
        <div className="flex flex-col border-b hairline lg:border-b-0 lg:border-r">
          <div className="flex-none">
            {cart.map((line) => {
              const product = getProductById(line.productId);
              if (!product) return null;

              return (
                <article
                  key={`${line.productId}-${line.colour || "default"}`}
                  className="grid grid-cols-[110px_1fr] gap-4 border-b hairline p-4 sm:grid-cols-[150px_1fr] md:p-6"
                >
                  <Link
                    href={`/shop/${product.slug}`}
                    className="relative aspect-[3/4] overflow-hidden bg-[var(--paper-2)]"
                  >
                    <Image
                      src={product.heroImage}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  </Link>

                  <div className="flex min-w-0 flex-col justify-between gap-5">
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                          {product.category}
                        </p>
                        <Link
                          href={`/shop/${product.slug}`}
                          className="mt-1 block text-lg font-medium tracking-[-0.03em]"
                        >
                          {product.name}
                        </Link>
                        {line.colour && (
                          <p className="mt-2 text-xs text-[var(--muted)]">
                            Finish: {line.colour}
                          </p>
                        )}
                      </div>
                      <p className="whitespace-nowrap text-sm font-medium">
                        {formatMoney(product.price * line.quantity)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center rounded-full border hairline px-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(
                              line.productId,
                              line.quantity - 1,
                              line.colour
                            )
                          }
                          className="focus-ring grid size-8 place-items-center"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="min-w-7 text-center text-xs">
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
                          className="focus-ring grid size-8 place-items-center"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeFromCart(line.productId, line.colour)
                        }
                        className="focus-ring inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* FILLER TO EXTEND THE BORDER-R FULL HEIGHT */}
          <div className="flex-1 bg-[var(--paper)]" />
        </div>

        {/* RIGHT COLUMN: SUMMARY */}
        <div className="w-full bg-[var(--paper-2)]">
          <aside className="p-4 md:p-8 lg:sticky lg:top-[80px]">
            <p className="kicker text-[var(--muted)]">Order summary</p>

            <div className="mt-5 space-y-3 border-y hairline py-5 text-sm">
              <div className="flex justify-between gap-4">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-4 text-[var(--muted)]">
                <span>Delivery</span>
                <span>Calculated at checkout</span>
              </div>
            </div>

            <div className="flex justify-between gap-4 py-5 text-lg font-medium">
              <span>Total before delivery</span>
              <span>{formatMoney(subtotal)}</span>
            </div>

            <Link
              href="/checkout"
              className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white hover:!text-white"
            >
              <span className="text-white">Continue to checkout</span>
              <ArrowRight size={14} className="shrink-0 text-white" />
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

            <div className="mt-5 grid gap-2 text-[10px] uppercase tracking-[0.06em] text-[var(--muted)]">
              <Link href="/wishlist" className="underline underline-offset-4">
                View saved items
              </Link>
              <Link href="/delivery" className="underline underline-offset-4">
                Delivery information
              </Link>
              <Link href="/returns" className="underline underline-offset-4">
                Returns information
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
