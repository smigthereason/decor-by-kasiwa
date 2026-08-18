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
} from "lucide-react";
import type { StoreProduct } from "@/types/commerce";
import { formatMoney, getProductBySlug } from "@/lib/products";
import { useCommerce } from "@/components/commerce/CommerceProvider";

export default function ProductDetailClient({
  product,
}: {
  product: StoreProduct;
}) {
  const { addToCart, toggleWishlist, isWishlisted } = useCommerce();
  const [quantity, setQuantity] = useState(1);
  const [colour, setColour] = useState(product.colours[0] || "");
  const [added, setAdded] = useState(false);
  const wishlisted = isWishlisted(product.id);

  function handleAdd() {
    addToCart(product.id, quantity, colour);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  const related = product.related
    .map((slug) => getProductBySlug(slug))
    .filter(Boolean) as StoreProduct[];

  return (
    <>
      <section className="w-full border-b hairline bg-[var(--paper)]">
        <div className="flex items-center gap-2 border-b hairline px-4 py-4 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] md:px-8">
          <Link href="/shop" className="focus-ring inline-flex items-center gap-2 text-[var(--ink)]">
            <ArrowLeft size={13} /> Shop
          </Link>
          <span>/</span>
          <span>{product.category}</span>
          <span>/</span>
          <span className="truncate">{product.name}</span>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
          <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
            {product.images.map((image, index) => (
              <motion.div
                key={image}
                className={`relative overflow-hidden bg-[var(--paper-2)] ${
                  index === 0 ? "aspect-[4/5] sm:col-span-2 sm:aspect-[16/10]" : "aspect-[4/5]"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.06 }}
              >
                <Image
                  src={image}
                  alt={`${product.name} view ${index + 1}`}
                  fill
                  priority={index === 0}
                  className="object-cover"
                />
              </motion.div>
            ))}
          </div>

          <aside className="self-start px-4 py-8 md:px-8 lg:sticky lg:top-[101px] lg:min-h-[calc(100vh-101px)] lg:py-10">
            <p className="kicker text-[var(--muted)]">{product.category}</p>
            <h1 className="mt-4 max-w-lg text-[clamp(2.5rem,5vw,5rem)] font-medium leading-[0.93] tracking-[-0.065em]">
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
              <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]">
                <span className="size-2 rounded-full bg-[var(--forest)]" />
                {product.stock}
              </span>
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
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                          : "hairline"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7 grid grid-cols-[116px_1fr] gap-2">
              <div className="flex items-center justify-between rounded-full border hairline px-3">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  className="focus-ring grid size-8 place-items-center"
                  aria-label="Decrease quantity"
                >
                  <Minus size={13} />
                </button>
                <span className="text-xs">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((value) => value + 1)}
                  className="focus-ring grid size-8 place-items-center"
                  aria-label="Increase quantity"
                >
                  <Plus size={13} />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--paper)]"
              >
                {added ? (
                  <>
                    <Check size={14} /> Added to bag
                  </>
                ) : (
                  <>Add to bag <ArrowRight size={14} /></>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => toggleWishlist(product.id)}
              className="focus-ring mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border hairline px-5 text-[10px] font-semibold uppercase tracking-[0.08em]"
            >
              <Heart size={14} fill={wishlisted ? "currentColor" : "none"} />
              {wishlisted ? "Saved" : "Save for later"}
            </button>

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
                <br />
                {product.materials.join(" · ")}
              </DetailRow>
              <DetailRow title="Care">{product.care}</DetailRow>
              <DetailRow title="Delivery & returns">
                Delivery and return rules are prototype placeholders until the client approves final fulfilment and returns policy.
              </DetailRow>
            </div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section className="w-full border-b hairline bg-[var(--canvas)] px-4 py-14 md:px-8 md:py-20">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="kicker text-[var(--muted)]">Complete the room</p>
              <h2 className="mt-3 text-[clamp(2.6rem,5vw,5rem)] font-medium leading-none tracking-[-0.06em]">
                CONSIDERED TOGETHER.
              </h2>
            </div>
            <Link href="/shop" className="editorial-link hidden sm:inline-flex">
              Shop all <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid gap-px bg-[var(--line)] sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/shop/${item.slug}`}
                className="group bg-[var(--canvas)] p-3"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={item.heroImage}
                    alt={item.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mt-3 flex justify-between gap-4 border-t hairline pt-3 text-sm">
                  <span>{item.name}</span>
                  <span className="whitespace-nowrap text-xs">{formatMoney(item.price)}</span>
                </div>
              </Link>
            ))}
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
