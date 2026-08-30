"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Check,
  ChevronDown,
  ImageOff,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  User,
  Phone,
  Mail,
  Store,
  Sparkles,
  RefreshCw,
  AlertCircle,
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

type SaleResponse = {
  message?: string;
  reference?: string;
  orderNumber?: string;
  displayText?: string;
  testMode?: boolean;
};

function variantLabel(variant: ProductVariant) {
  return variant.title || [variant.colour, variant.size].filter(Boolean).join(" · ") || "Variant";
}

function stockLabel(product: StoreProduct, variant?: ProductVariant) {
  const stock = variant?.stockQuantity ?? product.stockQuantity;
  if (typeof stock !== "number") return "In stock";
  return `${stock} in stock`;
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
  const [customerPhone, setCustomerPhone] = useState("+254");
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
    let timer: number | null = null;

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
          setCustomerPhone("+254");
          return;
        }

        if (payload.state === "failed") {
          setMessage(payload.message || "M-PESA payment failed.");
          setPaymentReference(null);
          setProcessing(false);
          return;
        }

        setMessage(payload.message || "Waiting for customer to approve the M-PESA prompt…");
      } catch (cause) {
        if (!stopped) setMessage(cause instanceof Error ? cause.message : "Unable to verify M-PESA payment.");
      }

      if (!stopped && attempts < 18) {
        timer = window.setTimeout(check, 10_000);
      } else if (!stopped) {
        setProcessing(false);
        setPaymentReference(null);
        setMessage("M-PESA confirmation timed out. Please check transaction log.");
      }
    };

    timer = window.setTimeout(check, 10_000);

    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
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

  function updateCustomerPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    let localDigits = digits.startsWith("254") ? digits.slice(3) : digits;
    if (localDigits.startsWith("0")) localDigits = localDigits.slice(1);
    setCustomerPhone(`+254${localDigits.slice(0, 9)}`);
  }

  async function completeSale() {
    if (!cart.length || processing) return;

    if (!customerName.trim()) {
      setMessage("Customer name is required before completing a sale.");
      return;
    }
    if (!/^\+254\d{9}$/.test(customerPhone)) {
      setMessage("Enter a valid Kenyan customer phone number (+254...).");
      return;
    }
    if (paymentMethod === "cash" && !cashConfirmed) {
      setMessage("Please confirm cash receipt before proceeding.");
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
      const payload = (await response.json()) as SaleResponse;
      if (!response.ok) throw new Error(payload.message || "POS sale failed.");

      if (paymentMethod === "cash") {
        setMessage(`Cash sale ${payload.orderNumber || ""} recorded successfully.`);
        setCart([]);
        setCashConfirmed(false);
        setCustomerName("");
        setCustomerEmail("");
        setCustomerPhone("+254");
        setProcessing(false);
      } else {
        if (!payload.reference) throw new Error("M-PESA charge started without a payment reference.");
        const prefix = payload.testMode ? "Paystack test mode: " : "";
        setMessage(`${prefix}${payload.displayText || "Customer STK prompt sent."}`);
        setPaymentReference(payload.reference);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "POS sale failed.");
      setProcessing(false);
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--paper-2)] text-[var(--ink)] font-sans antialiased">
      {/* POS Top Command Bar */}
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b hairline bg-[var(--paper)] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[var(--deep-green)] text-soft-cream shadow-sm">
            <Store size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">Point of Sale</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--deep-green)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--deep-green)]">
                <span className="size-1.5 rounded-full bg-[var(--deep-green)] animate-pulse" /> Live Terminal
              </span>
            </div>
            <p className="text-xs text-[var(--muted)]">In-store transactions & register</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#pos-cart-panel"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 text-xs font-semibold text-soft-cream shadow-sm transition-transform active:scale-95 lg:hidden"
          >
            <ShoppingCart size={15} />
            <span>{units} items</span>
            <span className="opacity-40">|</span>
            <span>{formatMoney(total)}</span>
          </a>
        </div>
      </header>

      {/* Status Notification Banner */}
      {message && (
        <div role="status" className="flex shrink-0 items-center gap-3 border-b hairline bg-[var(--deep-green)]/5 px-6 py-2.5 text-xs font-medium text-[var(--deep-green)]">
          <AlertCircle size={16} className="shrink-0 text-[var(--deep-green)]" />
          <span className="flex-1">{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-[10px] uppercase font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main POS Interface Grid */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Pane: Catalog & Selection */}
        <section className="flex flex-1 flex-col min-w-0 border-r hairline bg-[var(--paper)]">
          {/* Search Bar & Stats */}
          <div className="flex flex-wrap items-center gap-3 border-b hairline p-4 sm:px-6">
            <div className="relative flex-1 min-w-[240px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search catalog by product name, SKU, or category..."
                className="h-11 w-full rounded-xl border hairline bg-[var(--paper-2)] pl-10 pr-4 text-xs outline-none transition focus:border-[var(--deep-green)] focus:bg-[var(--paper)] focus:ring-2 focus:ring-[var(--deep-green)]/10"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
              <span className="rounded-md bg-[var(--paper-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]">
                {filtered.length}
              </span>
              <span>Products Available</span>
            </div>
          </div>

          {/* Product Grid Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 [scrollbar-width:thin]">
            {loading ? (
              <div className="grid h-full place-items-center">
                <div className="flex flex-col items-center gap-3 text-xs text-[var(--muted)]">
                  <RefreshCw size={24} className="animate-spin text-[var(--deep-green)]" />
                  <span>Syncing store inventory...</span>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="grid h-full place-items-center rounded-2xl border border-dashed hairline p-8 text-center">
                <div className="max-w-xs space-y-2">
                  <p className="text-sm font-semibold">No inventory found</p>
                  <p className="text-xs text-[var(--muted)]">Try broadening your search term or clearing filters.</p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="mt-2 inline-flex h-8 items-center rounded-lg bg-[var(--paper-2)] px-3 text-xs font-semibold hover:bg-[var(--paper-2)]/80"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((product) => {
                  const variant = selectedVariant(product);
                  const image = variant?.imageUrl || product.heroImage;
                  return (
                    <article
                      key={product.id}
                      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border hairline bg-[var(--paper)] transition-all hover:border-[var(--deep-green)]/40 hover:shadow-md"
                    >
                      <div>
                        {/* Image Canvas */}
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--paper-2)]">
                          {image ? (
                            <Image
                              src={image}
                              alt={product.name}
                              fill
                              unoptimized
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                              className="object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-[var(--muted)]/40">
                              <ImageOff size={22} strokeWidth={1.5} />
                            </div>
                          )}
                          <span className="absolute right-2 top-2 rounded-full bg-[var(--paper)]/90 px-2 py-0.5 text-[9px] font-semibold tracking-tight text-[var(--deep-green)] shadow-sm backdrop-blur-md">
                            {stockLabel(product, variant)}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="p-3">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug group-hover:text-[var(--deep-green)]">
                            {product.name}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                            {variant?.sku || product.sku || "No SKU"}
                          </p>

                          {/* Variant Selector */}
                          <div className="mt-2.5">
                            {product.variants && product.variants.length > 0 ? (
                              <div className="relative">
                                <select
                                  value={variant?.id || ""}
                                  onChange={(event) =>
                                    setVariantSelections((current) => ({
                                      ...current,
                                      [product.id]: event.target.value,
                                    }))
                                  }
                                  className="h-8 w-full appearance-none rounded-lg border hairline bg-[var(--paper-2)] pl-2.5 pr-7 text-[10px] font-medium outline-none transition focus:border-[var(--deep-green)]"
                                  aria-label={`Select variant for ${product.name}`}
                                >
                                  {product.variants.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {variantLabel(item)}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  size={12}
                                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                                />
                              </div>
                            ) : (
                              <div className="flex h-8 items-center text-[10px] text-[var(--muted)]">Standard Item</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between border-t hairline bg-[var(--paper-2)]/50 p-2.5">
                        <span className="text-xs font-bold tracking-tight">
                          {formatMoney(variant?.price ?? product.price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--deep-green)] px-3 text-[10px] font-semibold uppercase tracking-wider text-soft-cream shadow-xs transition-transform active:scale-95"
                        >
                          <Plus size={12} strokeWidth={2.5} /> Add
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Active Transaction Panel */}
        <aside
          id="pos-cart-panel"
          className="flex w-full flex-col bg-[var(--paper)] lg:w-[380px] xl:w-[420px] shrink-0 border-l hairline shadow-lg lg:shadow-none"
        >
          {/* Order Header */}
          <div className="flex items-center justify-between border-b hairline p-4 sm:px-6">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-[var(--deep-green)]" />
              <h2 className="text-sm font-semibold tracking-tight">Current Sale</h2>
            </div>
            <span className="rounded-full bg-[var(--paper-2)] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[var(--deep-green)]">
              {units} {units === 1 ? "unit" : "units"}
            </span>
          </div>

          {/* Cart Item Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 [scrollbar-width:thin]">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-[var(--muted)] py-12">
                <div className="grid size-12 place-items-center rounded-2xl bg-[var(--paper-2)] mb-3">
                  <ShoppingCart size={20} strokeWidth={1.5} />
                </div>
                <p className="text-xs font-semibold text-[var(--ink)]">Cart is empty</p>
                <p className="mt-1 text-[11px] max-w-[200px]">Select products from the catalog on the left to begin.</p>
              </div>
            ) : (
              cart.map((line) => (
                <div
                  key={line.key}
                  className="group relative flex flex-col justify-between rounded-xl border hairline bg-[var(--paper-2)] p-3 transition-colors hover:border-[var(--deep-green)]/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-semibold">{line.name}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        {[line.colour, line.size].filter(Boolean).join(" · ") || "Standard"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}
                      className="text-[var(--muted)] transition-colors hover:text-red-600"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t hairline pt-2.5">
                    {/* Quantity Stepper */}
                    <div className="flex items-center rounded-lg border hairline bg-[var(--paper)]">
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.key, -1)}
                        className="grid size-7 place-items-center hover:bg-[var(--paper-2)] rounded-l-lg"
                        aria-label={`Reduce ${line.name}`}
                      >
                        <Minus size={11} />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold tabular-nums">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.key, 1)}
                        className="grid size-7 place-items-center hover:bg-[var(--paper-2)] rounded-r-lg"
                        aria-label={`Increase ${line.name}`}
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <span className="text-xs font-bold tabular-nums">{formatMoney(line.unitPrice * line.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Checkout Drawer Section */}
          <div className="border-t hairline bg-[var(--paper-2)] p-4 sm:p-6 space-y-4">
            {/* Customer Inputs */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Customer Information</span>
              <div className="grid gap-2">
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Full Name *"
                    required
                    className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs outline-none focus:border-[var(--deep-green)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      value={customerPhone}
                      onChange={(e) => updateCustomerPhone(e.target.value)}
                      placeholder="+254..."
                      maxLength={13}
                      required
                      className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs font-mono outline-none focus:border-[var(--deep-green)]"
                    />
                  </div>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (Optional)"
                      type="email"
                      className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs outline-none focus:border-[var(--deep-green)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Payment Method</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-all ${
                    paymentMethod === "cash"
                      ? "border-[var(--deep-green)] bg-[var(--deep-green)] text-soft-cream shadow-xs"
                      : "border-hairline bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                  }`}
                >
                  <Banknote size={15} /> Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("mpesa")}
                  className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-all ${
                    paymentMethod === "mpesa"
                      ? "border-[var(--deep-green)] bg-[var(--deep-green)] text-soft-cream shadow-xs"
                      : "border-hairline bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                  }`}
                >
                  <Smartphone size={15} /> M-PESA STK
                </button>
              </div>

              {/* Dynamic Payment Specific Warnings */}
              {paymentMethod === "cash" ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border hairline bg-[var(--paper)] p-2.5 text-[11px] leading-tight">
                  <input
                    type="checkbox"
                    checked={cashConfirmed}
                    onChange={(e) => setCashConfirmed(e.target.checked)}
                    className="mt-0.5 size-3.5 accent-[var(--deep-green)]"
                  />
                  <span>
                    <strong>Confirm cash received:</strong> Check only after exact amount is physically collected.
                  </span>
                </label>
              ) : (
                <p className="rounded-lg border hairline bg-[var(--paper)] p-2.5 text-[11px] leading-normal text-[var(--muted)]">
                  Sends an instant prompt to the customer&apos;s handset via Paystack integration.
                </p>
              )}
            </div>

            {/* Total Summary & Checkout Button */}
            <div className="space-y-3 pt-2">
              <div className="flex items-baseline justify-between border-t hairline pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Total Amount</span>
                <span className="text-2xl font-extrabold tracking-tight tabular-nums text-[var(--deep-green)]">
                  {formatMoney(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void completeSale()}
                disabled={processing || cart.length === 0}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--deep-green)] text-xs font-bold uppercase tracking-wider text-soft-cream shadow-md transition-all hover:bg-[var(--deep-green)]/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {processing ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Processing Order...
                  </span>
                ) : paymentMethod === "cash" ? (
                  <span className="inline-flex items-center gap-2">
                    <Check size={16} /> Complete Cash Sale
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Smartphone size={16} /> Send M-PESA Prompt
                  </span>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
