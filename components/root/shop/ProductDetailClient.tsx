"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Minus,
  Plus,
  LockKeyhole,
  Maximize2,
  ShoppingBag,
  X,
  Zap,
} from "lucide-react";
import type { StoreProduct } from "@/types/commerce";
import { formatMoney } from "@/lib/money";
import { getMaximumPurchasableQuantity, isProductSoldOut } from "@/lib/catalogue";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import ProductCard from "@/components/root/shop/ProductCard";
import { getProductRating } from "@/lib/product-rating";
import ProductRatingStars from "@/components/root/shop/ProductRatingStars";
import { getQuantityPricingMessage, getQuantityUnitPrice } from "@/lib/product-pricing";

export default function ProductDetailClient({
  product,
  relatedProducts,
}: {
  product: StoreProduct;
  relatedProducts: StoreProduct[];
}) {
  const { addToCart, toggleWishlist, isWishlisted, catalogueReady, catalogueError } = useCommerce();
  const variants = product.variants || [];
  const initialVariant = variants[0];
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariant?.id || "");
  const [colour, setColour] = useState(initialVariant?.colour || product.colours[0] || "");
  const [size, setSize] = useState(initialVariant?.size || "");
  const [activeImage, setActiveImage] = useState(initialVariant?.imageUrl || product.images[0] || product.heroImage || "");
  const [added, setAdded] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const wishlisted = isWishlisted(product.id);
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const soldOut = isProductSoldOut(product) || selectedVariant?.stockQuantity === 0;
  const productMaximumQuantity = getMaximumPurchasableQuantity(product);
  const maximumQuantity =
    typeof selectedVariant?.stockQuantity === "number"
      ? productMaximumQuantity === null
        ? selectedVariant.stockQuantity
        : Math.min(productMaximumQuantity, selectedVariant.stockQuantity)
      : productMaximumQuantity;
  const purchasingUnavailable = !catalogueReady || Boolean(catalogueError);
  const { rating, reviewCount } = getProductRating(product);
  const displayPrice = getQuantityUnitPrice(product, quantity, selectedVariant?.price);
  const quantityPricingMessage = getQuantityPricingMessage(product);
  const colourOptions = useMemo(
    () => Array.from(new Set([...(product.colours || []), ...variants.map((variant) => variant.colour).filter((value): value is string => Boolean(value))])),
    [product.colours, variants],
  );
  const sizeOptions = useMemo(
    () => Array.from(new Set(variants.map((variant) => variant.size).filter((value): value is string => Boolean(value)))),
    [variants],
  );
  const productImages = useMemo(
    () => Array.from(new Set([product.heroImage, ...product.images, ...variants.map((variant) => variant.imageUrl || "")].filter(Boolean))),
    [product.heroImage, product.images, variants],
  );

  function selectVariant(variant: NonNullable<StoreProduct["variants"]>[number]) {
    setSelectedVariantId(variant.id);
    if (variant.colour) setColour(variant.colour);
    if (variant.size) setSize(variant.size);
    if (variant.imageUrl) setActiveImage(variant.imageUrl);
    setQuantity(1);
  }

  function selectColour(nextColour: string) {
    setColour(nextColour);
    const matching =
      variants.find((variant) => variant.colour === nextColour && (!size || variant.size === size)) ||
      variants.find((variant) => variant.colour === nextColour);
    if (matching) {
      selectVariant(matching);
    } else {
      setSelectedVariantId("");
      setSize("");
      setQuantity(1);
    }
  }

  function selectSize(nextSize: string) {
    setSize(nextSize);
    const matching =
      variants.find((variant) => variant.size === nextSize && (!colour || variant.colour === colour)) ||
      variants.find((variant) => variant.size === nextSize);
    if (matching) selectVariant(matching);
  }

  function selectImage(image: string) {
    setActiveImage(image);
    const matching = variants.find((variant) => variant.imageUrl === image);
    if (matching) selectVariant(matching);
  }

  function handleAdd() {
    if (soldOut || purchasingUnavailable) return;
    const addedToCart = addToCart(product.id, quantity, colour, size, selectedVariantId || undefined);
    if (!addedToCart) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    if (soldOut || purchasingUnavailable) return;
    const addedToCart = addToCart(product.id, quantity, colour, size, selectedVariantId || undefined);
    if (!addedToCart) return;
    setBuyingNow(true);
    window.setTimeout(() => {
      window.location.href = "/checkout";
    }, 300);
  }

  function handleMobileBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/shop";
  }

  const related = relatedProducts;

  return (
    <>
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
        {/* HEADER BAR */}
        <div className="hidden w-full items-center justify-between border-b hairline px-4 py-6 md:px-8 lg:flex">
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

        {/* MOBILE BACK NAVIGATION */}
        <div className="flex items-center border-b hairline px-4 py-2 lg:hidden">
          <button
            type="button"
            onClick={handleMobileBack}
            className="focus-ring -ml-2 inline-flex size-10 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--paper-2)]"
            aria-label="Go back"
          >
            <ArrowLeft size={22} strokeWidth={1.6} />
          </button>
        </div>

        {/* BREADCRUMB — DESKTOP ONLY */}
        <div className="hidden items-center gap-2 border-b hairline px-4 py-4 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] md:px-8 lg:flex">
          <Link href="/shop" className="focus-ring inline-flex items-center gap-2 text-[var(--ink)]">
            Shop
          </Link>
          <span>/</span>
          <span>{product.category}</span>
          <span>/</span>
          <span className="truncate">{product.name}</span>
        </div>

        {/* MOBILE PRODUCT EXPERIENCE */}
        <div className="lg:hidden">
          <div className="px-0 pb-8">
            {productImages.length > 0 ? (
              <div>
                <div className="relative aspect-square w-full overflow-hidden border-b hairline bg-[var(--paper-2)]">
                  <Image
                    src={activeImage || productImages[0]}
                    alt={`${product.name} - main view`}
                    fill
                    priority
                    className="object-contain p-5"
                    sizes="100vw"
                    unoptimized
                  />

                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    className="focus-ring absolute right-4 top-4 grid size-11 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper)]/95 shadow-sm backdrop-blur"
                    aria-label="Zoom product image"
                  >
                    <Maximize2 size={18} strokeWidth={1.6} />
                  </button>

                  {added && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute inset-x-4 bottom-5 flex items-center gap-3 rounded-2xl border border-[var(--ink)]/10 bg-[var(--paper)]/95 px-4 py-3 shadow-lg backdrop-blur"
                      role="status"
                    >
                      <ShoppingBag size={20} strokeWidth={1.5} className="shrink-0 text-[var(--deep-green)]" />
                      <p className="min-w-0 flex-1 text-sm text-[var(--muted)]">
                        <strong className="font-semibold text-[var(--ink)]">Great choice!</strong> Added to your cart.
                      </p>
                    </motion.div>
                  )}
                </div>

                {productImages.length > 1 && (
                  <div className="flex items-center justify-center gap-3 py-4" aria-label="Product image selector">
                    {productImages.map((image, index) => (
                      <button
                        type="button"
                        key={image}
                        onClick={() => selectImage(image)}
                        className={`focus-ring size-3 rounded-full border transition-all ${
                          image === activeImage
                            ? "border-[var(--deep-green)] bg-[var(--deep-green)] shadow-[0_0_0_3px_var(--paper),0_0_0_4px_var(--deep-green)]"
                            : "border-[var(--muted)]/70 bg-transparent"
                        }`}
                        aria-label={`Show image ${index + 1} of ${productImages.length}`}
                        aria-pressed={image === activeImage}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid aspect-square place-items-center border-b hairline bg-[var(--paper-2)] px-8 text-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--deep-green)]">Decor by Kasiwa</p>
                  <p className="mt-3 text-sm text-[var(--muted)]">Product imagery will be added soon.</p>
                </div>
              </div>
            )}

            <div className="px-5 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{product.category}</p>
              <h1 className="mt-3 text-[2.15rem] font-medium leading-[1.03] tracking-[-0.045em] text-[var(--ink)]">
                {product.name}
              </h1>

              <div className="mt-3">
                <p className="text-[2rem] font-semibold leading-none tracking-[-0.03em]">{formatMoney(displayPrice)}</p>
                {quantityPricingMessage && (
                  <p className="mt-2 text-xs font-medium text-[var(--deep-green)]">{quantityPricingMessage}</p>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
                <ProductRatingStars rating={rating} size={20} />
                <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
                {typeof reviewCount === "number" && (
                  <span className="text-sm font-medium text-[var(--deep-green)] underline underline-offset-4">
                    {reviewCount} {reviewCount === 1 ? "Review" : "Reviews"}
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm font-semibold text-[var(--deep-green)]">
                <a href="#product-details" className="focus-ring underline decoration-1 underline-offset-4">Product Details</a>
                <a href="#delivery-returns" className="focus-ring underline decoration-1 underline-offset-4">Easy Returns</a>
              </div>

              {colourOptions.length > 0 && (
                <div className="mt-8">
                  <p className="text-base text-[var(--muted)]">
                    Colour <span className="text-[var(--ink)]">- {colour}</span>
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {colourOptions.map((item) => {
                      const variantImage = variants.find((variant) => variant.colour === item)?.imageUrl;
                      return (
                        <button
                          type="button"
                          key={item}
                          onClick={() => selectColour(item)}
                          className={`focus-ring relative size-14 overflow-hidden rounded-full border-2 bg-[var(--paper-2)] transition-all ${
                            colour === item
                              ? "border-[var(--deep-green)] shadow-[0_0_0_4px_var(--paper),0_0_0_6px_var(--deep-green)]"
                              : "border-[var(--ink)]/15"
                          }`}
                          aria-label={`Select ${item}`}
                          aria-pressed={colour === item}
                          title={item}
                        >
                          {variantImage ? (
                            <Image src={variantImage} alt="" fill unoptimized sizes="56px" className="object-cover" />
                          ) : (
                            <span className="absolute inset-1 rounded-full" style={{ backgroundColor: getColourSwatch(item) }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sizeOptions.length > 0 && (
                <div className="mt-8">
                  <p className="text-base text-[var(--muted)]">Size <span className="text-[var(--ink)]">- {size}</span></p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sizeOptions.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => selectSize(item)}
                        className={`focus-ring min-w-14 rounded-full border px-4 py-3 text-sm transition-colors ${
                          size === item
                            ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream"
                            : "border-[var(--ink)]/20 bg-[var(--paper)]"
                        }`}
                        aria-pressed={size === item}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-9 flex items-center gap-2">
                <div className="flex min-h-14 w-[112px] shrink-0 items-center justify-between rounded-full border border-[var(--ink)]/35 px-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={soldOut || quantity <= 1}
                    className="focus-ring grid size-10 place-items-center disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={18} strokeWidth={1.5} />
                  </button>
                  <span className="text-base">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => maximumQuantity === null ? value + 1 : Math.min(maximumQuantity, value + 1))}
                    disabled={soldOut || (maximumQuantity !== null && quantity >= maximumQuantity)}
                    className="focus-ring grid size-10 place-items-center disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="Increase quantity"
                  >
                    <Plus size={18} strokeWidth={1.5} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={soldOut || purchasingUnavailable}
                  className="focus-ring inline-flex min-h-14 min-w-0 flex-1 items-center justify-center rounded-full bg-[var(--deep-green)] px-4 text-sm font-semibold !text-soft-cream transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {catalogueError ? "Catalogue unavailable" : !catalogueReady ? "Preparing cart…" : soldOut ? "Out of stock" : added ? "Added to cart" : "Add to Basket"}
                </button>

                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className="focus-ring grid size-12 shrink-0 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper)] shadow-sm"
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                  aria-pressed={wishlisted}
                >
                  <Heart size={24} strokeWidth={1.5} fill={wishlisted ? "currentColor" : "none"} />
                </button>
              </div>

              {maximumQuantity !== null && maximumQuantity <= 5 && !soldOut && (
                <p className="mt-2 text-xs text-[var(--muted)]">Only {maximumQuantity} left in stock.</p>
              )}

              <button
                type="button"
                onClick={handleBuyNow}
                disabled={buyingNow || soldOut || purchasingUnavailable}
                className="focus-ring mt-3 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full border border-[var(--deep-green)] px-5 text-sm font-semibold text-[var(--deep-green)] disabled:opacity-50"
              >
                <Zap size={16} /> {buyingNow ? "Redirecting..." : "Buy Now"}
              </button>

              <div className="mt-8 border-t hairline pt-6">
                <p className="text-sm leading-7 text-[var(--muted)]">{product.description}</p>
              </div>

              <div id="product-details" className="mt-5 divide-y hairline border-y hairline scroll-mt-24">
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
                <div id="delivery-returns" className="scroll-mt-24">
                  <DetailRow title="Delivery & returns">
                    Delivery options and prices are shown at checkout. Return terms are subject to the store's approved fulfilment and returns policy.
                  </DetailRow>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP PRODUCT EXPERIENCE */}
        <div className="hidden flex-1 items-stretch lg:grid lg:grid-cols-[1.35fr_0.65fr]">
          {/* LEFT COLUMN: IMAGES */}
          <div className="flex flex-col border-b hairline lg:border-b-0 lg:border-r">
            {productImages.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4 p-4 lg:p-6 lg:sticky lg:top-24 h-fit">

                {/* Primary / Hero Image Container */}
                <motion.div
                  className="relative flex-1 overflow-hidden rounded-2xl bg-[var(--paper-2)] border border-[var(--line)] aspect-[4/5] max-h-[75vh]"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <Image
                    src={activeImage || productImages[0]}
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
                {productImages.filter((image) => image !== activeImage).length > 0 && (
                  <div className="flex max-h-[75vh] gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:overflow-y-auto">
                    {productImages.filter((image) => image !== activeImage).map((image, index) => (
                      <motion.button
                        type="button"
                        key={image}
                        onClick={() => selectImage(image)}
                        className="group relative aspect-[4/5] w-20 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--paper-2)] transition-all duration-300 hover:border-[var(--deep-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-green)]/30 lg:w-24"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (index + 1) * 0.08, duration: 0.4 }}
                        aria-label={`Show ${product.name} image ${index + 2}`}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} view ${index + 2}`}
                          fill
                          className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                          sizes="100px"
                          unoptimized
                        />
                      </motion.button>
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

              <div className="mt-4 flex flex-wrap items-center gap-2" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
                <ProductRatingStars rating={rating} size={17} />
                <span className="text-sm font-semibold">{rating.toFixed(1)}</span>
                {typeof reviewCount === "number" && (
                  <span className="text-xs text-[var(--muted)]">({reviewCount} reviews)</span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b hairline pb-5">
                <div>
                  <p className="text-xl font-medium">{formatMoney(displayPrice)}</p>
                  {quantityPricingMessage && (
                    <p className="mt-1 text-[10px] font-medium text-[var(--deep-green)]">
                      {quantityPricingMessage}
                    </p>
                  )}
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

              {colourOptions.length > 0 && (
                <div className="mt-7">
                  <div className="mb-3 flex justify-between text-[10px] uppercase tracking-[0.08em]">
                    <span>Finish / colour</span>
                    <span className="text-[var(--muted)]">{colour}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colourOptions.map((item) => {
                      const variantImage = variants.find((variant) => variant.colour === item)?.imageUrl;
                      return (
                        <button
                          type="button"
                          key={item}
                          onClick={() => selectColour(item)}
                          className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                            colour === item
                              ? "border-[var(--ink)] bg-[var(--deep-green)] text-[var(--paper)]"
                              : "hairline"
                          }`}
                          aria-pressed={colour === item}
                        >
                          {variantImage && (
                            <span className="relative size-6 overflow-hidden rounded-full border border-current/20 bg-[var(--paper-2)]">
                              <Image src={variantImage} alt="" fill unoptimized sizes="24px" className="object-cover" />
                            </span>
                          )}
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {sizeOptions.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex justify-between text-[10px] uppercase tracking-[0.08em]">
                    <span>Size</span>
                    <span className="text-[var(--muted)]">{size}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sizeOptions.map((item) => (
                      <button
                        type="button"
                        key={item}
                        onClick={() => selectSize(item)}
                        className={`focus-ring min-w-12 rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.08em] transition-colors ${
                          size === item
                            ? "border-[var(--ink)] bg-[var(--deep-green)] text-[var(--paper)]"
                            : "hairline"
                        }`}
                        aria-pressed={size === item}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* QUANTITY + ADD TO CART */}
              <div className="mt-7">
                <div className="mb-3 text-[10px] uppercase tracking-[0.08em]">Quantity</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-h-12 w-full max-w-[126px] items-center justify-between rounded-full border hairline px-3">
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
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={soldOut || purchasingUnavailable}
                    className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {catalogueError ? (
                      <>Catalogue unavailable</>
                    ) : !catalogueReady ? (
                      <>Preparing cart…</>
                    ) : soldOut ? (
                      <>Out of stock</>
                    ) : added ? (
                      <>
                        <Check size={14} /> Added to cart
                      </>
                    ) : (
                      <>Add to cart <ArrowRight size={14} className="text-soft-cream" /></>
                    )}
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

      {zoomOpen && productImages.length > 0 && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--paper)]/98 p-4 lg:hidden" role="dialog" aria-modal="true" aria-label="Zoomed product image">
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            className="focus-ring absolute right-4 top-4 z-10 grid size-12 place-items-center rounded-full border border-[var(--ink)]/10 bg-[var(--paper)] shadow-sm"
            aria-label="Close image zoom"
          >
            <X size={22} />
          </button>
          <div className="relative h-[85vh] w-full max-w-3xl">
            <Image
              src={activeImage || productImages[0]}
              alt={`${product.name} zoomed view`}
              fill
              className="object-contain"
              sizes="100vw"
              unoptimized
            />
          </div>
        </div>
      )}

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
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


function getColourSwatch(colour: string) {
  const value = colour.trim().toLowerCase();
  const swatches: Array<[string, string]> = [
    ["warm ivory", "#F2EBDD"],
    ["ivory", "#F7F1E4"],
    ["cream", "#EFE5D2"],
    ["charcoal", "#41413F"],
    ["black", "#252525"],
    ["sand", "#CDBB9A"],
    ["natural", "#C7B394"],
    ["olive", "#7C8060"],
    ["sage", "#A8B09B"],
    ["taupe", "#A79A8E"],
    ["deep brown", "#4A352B"],
    ["brown", "#765743"],
    ["brushed brass", "#B08D57"],
    ["warm brass", "#B68A4B"],
    ["brass", "#B08D57"],
    ["gold", "#C4A35A"],
    ["white", "#F7F7F4"],
    ["grey", "#999994"],
    ["gray", "#999994"],
  ];
  return swatches.find(([name]) => value.includes(name))?.[1] || "#D8D2C4";
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
