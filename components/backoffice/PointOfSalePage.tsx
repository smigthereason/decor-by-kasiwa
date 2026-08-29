"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
} from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { ProductVariant, StoreProduct } from "@/types/commerce";

type PosLine = {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  colour?: string;
  size?: string;
  variantId?: string;
  unitPrice: number;
};

type PaymentMethod = "cash" | "mpesa";

function variantLabel(variant: ProductVariant) {
  return variant.title || [variant.colour, variant.size].filter(Boolean).join(" · ") || "Variant";
}

export default function PointOfSalePage() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<PosLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the live catalogue.");
        return response.json() as Promise<{ products?: StoreProduct[] }>;
      })
      .then((payload) => {
        if (!cancelled) setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch((cause) => {
        if (!cancelled) setMessage(cause instanceof Error ? cause.message : "Could not load products.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!paymentReference) return;
    let stopped = false;
    let attempts = 0;

    const check = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/backoffice/pos/verify?reference=${encodeURIComponent(paymentReference)}`, { cache: "no-store" });
        const payload = (await response.json()) as { state?: string; message?: string; order?: { orderNumber?: string } };
        if (!response.ok) throw new Error(payload.message || "Unable to verify M-PESA payment.");
        if (stopped) return;

        if (payload.state === "paid") {
          setMessage(`M-PESA payment confirmed. Sale ${payload.order?.orderNumber || paymentReference} recorded.`);
          setPaymentReference(null);
          setCart([]);
          setProcessing(false);
          setCustomerName("");
          setCustomerEmail("");
          setCustomerPhone("");
          return;
        }

        if (payload.state === "failed") {
          setMessage(payload.message || "M-PESA payment failed.");
          setPaymentReference(null);
          setProcessing(false);
          return;
        }

        setMessage(payload.message || "Waiting for the customer to approve the M-PESA prompt…");
      } catch (cause) {
        if (!stopped) setMessage(cause instanceof Error ? cause.message : "Unable to verify M-PESA payment.");
      }

      if (!stopped && attempts < 60) window.setTimeout(check, 3000);
      else if (!stopped) {
        setProcessing(false);
        setPaymentReference(null);
        setMessage("M-PESA confirmation timed out. Check the transaction before trying again.");
      }
    };

    void check();
    return () => {
      stopped = true;
    };
  }, [paymentReference]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((product) => product.available !== false && (product.stockQuantity === null || product.stockQuantity === undefined || product.stockQuantity > 0))
      .filter((product) => !term || [product.name, product.sku, product.category].some((value) => value?.toLowerCase().includes(term)))
      .slice(0, 80);
  }, [products, search]);

  const total = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);

  function selectedVariant(product: StoreProduct) {
    const selectedId = variantSelections[product.id];
    return product.variants?.find((variant) => variant.id === selectedId) || product.variants?.[0];
  }

  function addProduct(product: StoreProduct) {
    const variant = selectedVariant(product);
    const key = `${product.id}|${variant?.id || "default"}`;
    const unitPrice = variant?.price ?? product.price;
    setCart((current) => {
      const index = current.findIndex((line) => line.key === key);
      if (index < 0) {
        return [
          ...current,
          {
            key,
            productId: product.id,
            name: product.name,
            quantity: 1,
            colour: variant?.colour,
            size: variant?.size,
            variantId: variant?.id,
            unitPrice,
          },
        ];
      }
      return current.map((line, currentIndex) => currentIndex === index ? { ...line, quantity: line.quantity + 1 } : line);
    });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) => current
      .map((line) => line.key === key ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter((line) => line.quantity > 0));
  }

  async function completeSale() {
    if (!cart.length || processing) return;
    if (paymentMethod === "cash" && !cashConfirmed) {
      setMessage("Tick Cash received before completing a cash sale.");
      return;
    }
    if (paymentMethod === "mpesa" && !customerPhone.trim()) {
      setMessage("Customer phone is required for an M-PESA STK push.");
      return;
    }

    setProcessing(true);
    setMessage(null);
    const requestId = crypto.randomUUID();

    try {
      const response = await fetch("/api/backoffice/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          paymentMethod,
          cashConfirmed,
          customerName,
          customerEmail,
          customerPhone,
          cart: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            colour: line.colour,
            size: line.size,
            variantId: line.variantId,
          })),
        }),
      });
      const payload = (await response.json()) as { message?: string; reference?: string; orderNumber?: string; displayText?: string };
      if (!response.ok) throw new Error(payload.message || "POS sale failed.");

      if (paymentMethod === "cash") {
        setMessage(`Cash sale ${payload.orderNumber || ""} recorded successfully.`);
        setCart([]);
        setCashConfirmed(false);
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("");
        setProcessing(false);
      } else {
        if (!payload.reference) throw new Error("M-PESA charge started without a payment reference.");
        setMessage(payload.displayText || "Ask the customer to approve the M-PESA prompt on their phone.");
        setPaymentReference(payload.reference);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "POS sale failed.");
      setProcessing(false);
    }
  }

  return (
    <div className="min-h-full min-w-0 overflow-x-hidden bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Physical store</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Point of Sale</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">
          Record every physical sale against the signed-in staff member. Accept confirmed cash or send a Paystack M-PESA STK push.
        </p>
        {message && <p className="mt-4 rounded-lg bg-[var(--paper-2)] px-4 py-3 text-xs leading-5 text-[var(--deep-green)]">{message}</p>}
      </div>

      <div className="grid min-w-0 gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:p-8">
        <section className="min-w-0 rounded-xl border hairline bg-[var(--paper)] p-4 sm:p-5">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, SKU or category…"
              className="min-h-12 w-full rounded-full border hairline py-3 pl-11 pr-4 text-sm outline-none focus:border-[var(--deep-green)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
            />
          </div>

          {loading ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">Loading live inventory…</p>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((product) => {
                const variant = selectedVariant(product);
                return (
                  <article key={product.id} className="min-w-0 overflow-hidden rounded-xl border hairline bg-[var(--paper-2)]">
                    <div className="relative aspect-square bg-[var(--warm-beige)]">
                      {(variant?.imageUrl || product.heroImage) && (
                        <Image src={variant?.imageUrl || product.heroImage} alt={product.name} fill unoptimized sizes="220px" className="object-cover" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 text-xs font-semibold leading-5">{product.name}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{product.sku || "No SKU"} · {product.stockQuantity ?? "?"} in stock</p>
                      <p className="mt-2 text-sm font-semibold">{formatMoney(variant?.price ?? product.price)}</p>

                      {product.variants && product.variants.length > 0 && (
                        <div className="relative mt-3">
                          <select
                            value={variant?.id || ""}
                            onChange={(event) => setVariantSelections((current) => ({ ...current, [product.id]: event.target.value }))}
                            className="min-h-10 w-full appearance-none rounded-lg border hairline bg-[var(--paper)] py-2 pl-3 pr-9 text-[10px] outline-none"
                            aria-label={`Choose variant for ${product.name}`}
                          >
                            {product.variants.map((item) => <option key={item.id} value={item.id}>{variantLabel(item)}</option>)}
                          </select>
                          <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        className="mt-3 min-h-10 w-full rounded-full bg-[var(--deep-green)] px-3 text-[9px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
                      >
                        Add to sale
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-xl border hairline bg-[var(--paper)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="kicker text-[var(--muted)]">Current sale</p>
                <h2 className="mt-1 text-xl font-medium">{units} unit{units === 1 ? "" : "s"}</h2>
              </div>
              <ShoppingCart size={22} className="text-[var(--deep-green)]" />
            </div>

            <div className="mt-4 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="rounded-lg bg-[var(--paper-2)] p-4 text-xs text-[var(--muted)]">Search and add products to start the physical sale.</p>
              ) : cart.map((line) => (
                <div key={line.key} className="rounded-lg border hairline p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{line.name}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">{[line.colour, line.size].filter(Boolean).join(" · ") || "Standard"}</p>
                    </div>
                    <button type="button" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))} className="text-[var(--muted)] hover:text-red-600" aria-label={`Remove ${line.name}`}><Trash2 size={14} /></button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center rounded-full border hairline">
                      <button type="button" onClick={() => changeQuantity(line.key, -1)} className="grid size-8 place-items-center"><Minus size={12} /></button>
                      <span className="min-w-7 text-center text-xs">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.key, 1)} className="grid size-8 place-items-center"><Plus size={12} /></button>
                    </div>
                    <span className="text-xs font-semibold">{formatMoney(line.unitPrice * line.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t hairline pt-4">
              <span className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Total</span>
              <span className="text-2xl font-semibold tracking-[-0.04em]">{formatMoney(total)}</span>
            </div>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-4 sm:p-5">
            <p className="kicker text-[var(--muted)]">Customer</p>
            <div className="mt-3 grid gap-2">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name (optional)" className="min-h-11 rounded-lg border hairline px-3 text-sm outline-none focus:border-[var(--deep-green)]" />
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email (optional)" type="email" className="min-h-11 rounded-lg border hairline px-3 text-sm outline-none focus:border-[var(--deep-green)]" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder={paymentMethod === "mpesa" ? "M-PESA phone (required)" : "Phone (optional)"} inputMode="tel" className="min-h-11 rounded-lg border hairline px-3 text-sm outline-none focus:border-[var(--deep-green)]" />
            </div>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-4 sm:p-5">
            <p className="kicker text-[var(--muted)]">Payment</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setPaymentMethod("cash")} className={`min-h-12 rounded-xl border px-3 text-xs font-semibold ${paymentMethod === "cash" ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream" : "hairline"}`}><span className="inline-flex items-center gap-2"><Banknote size={15} /> Cash</span></button>
              <button type="button" onClick={() => setPaymentMethod("mpesa")} className={`min-h-12 rounded-xl border px-3 text-xs font-semibold ${paymentMethod === "mpesa" ? "border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream" : "hairline"}`}><span className="inline-flex items-center gap-2"><Smartphone size={15} /> M-PESA STK</span></button>
            </div>

            {paymentMethod === "cash" && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-[var(--paper-2)] p-3 text-xs leading-5">
                <input type="checkbox" checked={cashConfirmed} onChange={(e) => setCashConfirmed(e.target.checked)} className="mt-1 size-4 accent-[var(--deep-green)]" />
                <span><strong>Cash received.</strong> Tick only after the amount has physically been handed over.</span>
              </label>
            )}

            <button
              type="button"
              onClick={() => void completeSale()}
              disabled={processing || cart.length === 0}
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:cursor-not-allowed disabled:opacity-45"
            >
              {processing ? "Processing…" : paymentMethod === "cash" ? <><Check size={14} /> Complete cash sale</> : <><Smartphone size={14} /> Send STK push</>}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
