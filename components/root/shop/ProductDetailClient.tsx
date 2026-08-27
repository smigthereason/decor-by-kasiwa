"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Minus,
  Plus,
  LockKeyhole,
  Zap,
} from "lucide-react";
import type { StoreProduct } from "@/types/commerce";
import { formatMoney } from "@/lib/money";
import { getMaximumPurchasableQuantity, isProductSoldOut } from "@/lib/catalogue";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import ProductCard from "@/components/root/shop/ProductCard";

export default function ProductDetailClient({
  product,
  relatedProducts,
}: {
  product: StoreProduct;
  relatedProducts: StoreProduct[];
}) {
  const { addToCart, toggleWishlist, isWishlisted, catalogueReady, catalogueError } = useCommerce();
  const [quantity, setQuantity] = useState(1);
  const [colour, setColour] = useState(product.colours[0] || "");
  const [added, setAdded] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const wishlisted = isWishlisted(product.id);
  const soldOut = isProductSoldOut(product);
  const maximumQuantity = getMaximumPurchasableQuantity(product);
  const purchasingUnavailable = !catalogueReady || Boolean(catalogueError);

  function handleAdd() {
    if (soldOut || purchasingUnavailable) return;
    const addedToCart = addToCart(product.id, quantity, colour);
    if (!addedToCart) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    if (soldOut || purchasingUnavailable) return;
    const addedToCart = addToCart(product.id, quantity, colour);
    if (!addedToCart) return;
    setBuyingNow(true);
    window.setTimeout(() => {
      window.location.href = "/checkout";
    }, 300);
  }

  const related = relatedProducts;

  return (
    <>
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
        {/* HEADER BAR */}
        <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
          <Link
            href="/shop"
            className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
            <span className="hidden sm:inline">Continue shopping</span>
            <span className="sm:hidden">Back</span>
          </Link>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            <LockKeyhole size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">Secure Checkout</span>
          </div>
        </div>

        {/* BREADCRUMB */}
        <div className="flex items-center gap-2 border-b hairline px-4 py-4 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] md:px-8">
          <Link href="/shop" className="focus-ring inline-flex items-center gap-2 text-[var(--ink)]">
            Shop
          </Link>
          <span>/</span>
          <span>{product.category}</span>
          <span>/</span>
          <span className="truncate">{product.name}</span>
        </div>

        {/* MAIN CONTENT */}
        <div className="grid flex-1 items-stretch lg:grid-cols-[1.35fr_0.65fr]">
          {/* LEFT COLUMN: IMAGES */}
          <div className="flex flex-col border-b hairline lg:border-b-0 lg:border-r">
            {product.images.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4 p-4 lg:p-6 lg:sticky lg:top-24 h-fit">

                {/* Primary / Hero Image Container */}
                <motion.div
                  className="relative flex-1 overflow-hidden rounded-2xl bg-[var(--paper-2)] border border-[var(--line)] aspect-[4/5] max-h-[75vh]"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <Image
                    src={product.images[0]}
                    alt={`${product.name} - main view`}
                    fill
                    priority
                    className="object-contain p-4"
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    unoptimized
                  />

                  {/* Featured Badge */}
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10">
                    <span className="text-[10px] font-semibold tracking-widest text-white uppercase">
                      Featured
                    </span>
                  </div>
                </motion.div>

                {/* Side Thumbnail Rail (Horizontal on Mobile, Vertical Scroll on Desktop) */}
                {product.images.slice(1).length > 0 && (
                  <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-y-auto max-h-[75vh] scrollbar-none py-1">
                    {product.images.slice(1).map((image, index) => (
                      <motion.div
                        key={image}
                        className="group relative flex-shrink-0 w-20 lg:w-24 aspect-[4/5] overflow-hidden rounded-xl bg-[var(--paper-2)] border border-[var(--line)] cursor-pointer transition-all duration-300 hover:border-[var(--deep-green)]"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (index + 1) * 0.08, duration: 0.4 }}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} view ${index + 2}`}
                          fill
                          className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                          sizes="100px"
                          unoptimized
                        />

                        {/* Subtle Overlay */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-2">
                          <span className="text-[10px] text-white font-medium backdrop-blur-sm px-2 py-0.5 rounded bg-black/40">
                            {index + 2}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Minimalist Decorative Placeholder */
              <motion.div
                className="relative min-h-[500px] lg:min-h-[700px] bg-gradient-to-br from-[var(--warm-beige)] to-[var(--paper-2)] flex items-center justify-center p-8 overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
              >
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                  <div className="absolute top-10 right-10 w-48 h-48 rounded-full border-4 border-[var(--deep-green)]" />
                  <div className="absolute bottom-10 left-10 w-36 h-36 rounded-full border-4 border-[var(--deep-green)]" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full border-4 border-[var(--deep-green)]" />
                </div>

                <div className="relative text-center space-y-4 max-w-sm z-10">
                  <span className="inline-block px-4 py-1.5 bg-[var(--deep-green)]/10 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--deep-green)]">
                    Decor by Kasiwa
                  </span>

                  <div className="space-y-2">
                    <p className="text-3xl font-light text-[var(--deep-green)]">📸</p>
                    <p className="text-sm text-[var(--muted)] font-medium leading-relaxed">
                      Product imagery will be added soon.
                    </p>
                    <p className="text-xs text-[var(--muted)]/60">
                      Check back for updates
                    </p>
                  </div>
                </div>
              </motion.div>
            )}


          </div>

          {/* RIGHT COLUMN: DETAILS */}
          <div className="w-full">
            <aside className="p-4 md:p-8 lg:sticky lg:top-[80px]">
              <p className="kicker text-[var(--muted)]">{product.category}</p>
              <h1 className="mt-4 max-w-lg text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.93] tracking-[-0.06em]">
                {product.name}
              </h1>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b hairline pb-5">
                <div>
                  <p className="text-xl font-medium">{formatMoney(product.price)}</p>
                  {product.demoPrice && (
                    <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">
                      Prototype price — replace from Sanity before launch
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]">
                    <span className={`size-2 rounded-full ${soldOut ? "bg-[var(--muted)]" : "bg-[var(--forest)]"}`} />
                    {product.stock}
                  </span>
                  {product.sku && (
                    <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">SKU {product.sku}</p>
                  )}
                </div>
              </div>

              <p className="mt-6 text-sm leading-relaxed text-[var(--muted)]">
                {product.description}
              </p>

              {product.colours.length > 0 && (
                <div className="mt-7">
                  <div className="mb-3 flex justify-between text-[10px] uppercase tracking-[0.08em]">
                    <span>Finish / colour</span>
                    <span className="text-[var(--muted)]">{colour}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.colours.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => setColour(item)}
                        className={`focus-ring rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                          colour === item
                            ? "border-[var(--ink)] bg-[var(--deep-green)] text-[var(--paper)]"
                            : "hairline"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* QUANTITY SELECTOR */}
              <div className="mt-7">
                <div className="mb-3 text-[10px] uppercase tracking-[0.08em]">
                  Quantity
                </div>
                <div className="flex items-center justify-between rounded-full border hairline px-3 max-w-[116px]">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={soldOut || quantity <= 1}
                    className="focus-ring grid size-8 place-items-center disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="text-xs">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => maximumQuantity === null ? value + 1 : Math.min(maximumQuantity, value + 1))}
                    disabled={soldOut || (maximumQuantity !== null && quantity >= maximumQuantity)}
                    className="focus-ring grid size-8 place-items-center disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Increase quantity"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {maximumQuantity !== null && maximumQuantity <= 5 && !soldOut && (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">Only {maximumQuantity} left in stock.</p>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={soldOut || purchasingUnavailable}
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {catalogueError ? (
                    <>Catalogue unavailable</>
                  ) : !catalogueReady ? (
                    <>Preparing bag…</>
                  ) : soldOut ? (
                    <>Out of stock</>
                  ) : added ? (
                    <>
                      <Check size={14} /> Added to bag
                    </>
                  ) : (
                    <>Add to bag <ArrowRight size={14} className="text-soft-cream" /></>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={buyingNow || soldOut || purchasingUnavailable}
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)] transition-all hover:bg-[var(--deep-green)] hover:text-[var(--paper)] disabled:opacity-50"
                >
                  {buyingNow ? (
                    <>
                      <Check size={14} /> Redirecting...
                    </>
                  ) : (
                    <>
                      <Zap size={14} /> Buy Now
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full border hairline px-5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                >
                  <Heart size={14} fill={wishlisted ? "currentColor" : "none"} />
                  {wishlisted ? "Saved" : "Save for later"}
                </button>
              </div>

              <div className="mt-7 grid gap-3 border-y hairline py-5 text-[11px] leading-relaxed">
                <p>
                  <strong>Delivery:</strong> final delivery method, fee and timing are confirmed at checkout once product logistics are configured.
                </p>
                <p>
                  <strong>Need help placing it?</strong>{" "}
                  <Link href="/consultation" className="underline underline-offset-4">
                    Book a styling consultation
                  </Link>
                  .
                </p>
              </div>

              <div className="mt-2 divide-y hairline border-b hairline">
                <DetailRow title="The piece">{product.story}</DetailRow>
                <DetailRow title="Details & dimensions">
                  {product.dimensions}
                  {product.materials.length > 0 && (
                    <>
                      <br />
                      {product.materials.join(" · ")}
                    </>
                  )}
                </DetailRow>
                <DetailRow title="Care">{product.care}</DetailRow>
                <DetailRow title="Delivery & returns">
                  Delivery and return rules are prototype placeholders until the client approves final fulfilment and returns policy.
                </DetailRow>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="w-full border-t hairline bg-[var(--paper)]">
          {/* RELATED HEADER - MORE SPACIOUS */}
          <div className="border-b hairline px-4 py-10 md:px-8 md:py-14 lg:px-12">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="kicker text-[var(--muted)]">Complete the room</p>
                <h2 className="mt-4 text-[clamp(2.5rem,5vw,4.5rem)] font-medium leading-[0.9] tracking-[-0.06em]">
                  CONSIDERED TOGETHER.
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
                  Pieces selected to work beautifully alongside this one, creating a cohesive and considered space.
                </p>
              </div>
              <Link
                href="/shop"
                className="focus-ring group inline-flex shrink-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              >
                Shop all
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* RELATED PRODUCTS GRID */}
          <div className="px-4 py-8 sm:px-6 md:px-8 md:py-12 lg:px-10 xl:px-12">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>

          {/* MOBILE SHOP ALL LINK */}
          <div className="border-t hairline px-4 py-4 sm:hidden">
            <Link
              href="/shop"
              className="focus-ring inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]"
            >
              Shop all <ArrowRight size={13} />
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

function DetailRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring flex w-full items-center justify-between py-4 text-left text-[10px] font-semibold uppercase tracking-[0.08em]"
        aria-expanded={open}
      >
        {title}
        <Plus
          size={14}
          className={`transition-transform ${open ? "rotate-45" : ""}`}
        />
      </button>
      {open && (
        <p className="max-w-lg pb-5 text-xs leading-relaxed text-[var(--muted)]">
          {children}
        </p>
      )}
    </div>
  );
}
