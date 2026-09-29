"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
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
  Maximize2,
  Minimize2,
  Store,
  Sparkles,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  HandCoins,
  Percent,
  ReceiptText,
  UserRoundSearch,
} from "lucide-react";

import { formatMoney } from "@/lib/money";
import type { ProductVariant, StoreProduct } from "@/types/commerce";
import { getQuantityUnitPrice } from "@/lib/product-pricing";

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

type PaymentMethod = "mpesa" | "manual";

type SaleResponse = {
  message?: string;
  reference?: string;
  orderId?: string;
  orderNumber?: string;
  receiptNumber?: string;
  paymentStatus?: string;
  amountPaid?: number;
  balanceDue?: number;
  deliveryFee?: number;
  deliveryLocation?: string;
  displayText?: string;
  testMode?: boolean;
};

type SaleCompletion = {
  kind: "mpesa" | "manual";
  orderId: string;
  orderNumber?: string;
  receiptNumber?: string;
};

type CustomerMatch = {
  _id: string;
  name: string;
  email?: string;
  phone: string;
  outstandingBalance?: number;
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
  const { data: session } = useSession();
  const manager = session?.user?.role === "ADMIN" || session?.user?.role === "STORE";
  const basePath = session?.user?.role === "ADMIN" ? "/admin" : "/store";

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<PosLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mpesa");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerMatches, setCustomerMatches] = useState<CustomerMatch[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("+254");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryAddressLine, setDeliveryAddressLine] = useState("");
  const [deliveryRecipientName, setDeliveryRecipientName] = useState("");
  const [deliveryRecipientPhone, setDeliveryRecipientPhone] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [manualPaymentName, setManualPaymentName] = useState("");
  const [manualPaymentReference, setManualPaymentReference] = useState("");
  const [manualAmountReceived, setManualAmountReceived] = useState("");
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{ orderId: string; receiptNumber?: string } | null>(null);
  const [saleCompletion, setSaleCompletion] = useState<SaleCompletion | null>(null);
  const [salePanelExpanded, setSalePanelExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/catalog?channel=pos", { cache: "no-store" })
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
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void fetch(`/api/backoffice/pos/customers?q=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as { customers?: CustomerMatch[] };
          if (!response.ok) throw new Error("Unable to search customers.");
          setCustomerMatches(payload.customers || []);
        })
        .catch(() => setCustomerMatches([]));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [customerSearch]);

  useEffect(() => {
    if (!salePanelExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSalePanelExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [salePanelExpanded]);

  useEffect(() => {
    if (!paymentReference) return;
    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;

    const check = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/backoffice/pos/verify?reference=${encodeURIComponent(paymentReference)}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          state?: string;
          message?: string;
          order?: { orderId?: string; orderNumber?: string; receiptNumber?: string };
        };
        if (!response.ok) throw new Error(payload.message || "Unable to verify payment.");
        if (stopped) return;

        if (payload.state === "paid") {
          setMessage(`Payment confirmed. Sale ${payload.order?.orderNumber || paymentReference} recorded.`);
          if (payload.order?.orderId) {
            setLastReceipt({ orderId: payload.order.orderId, receiptNumber: payload.order.receiptNumber });
            setSaleCompletion({
              kind: "mpesa",
              orderId: payload.order.orderId,
              orderNumber: payload.order.orderNumber,
              receiptNumber: payload.order.receiptNumber,
            });
          }
          setPaymentReference(null);
          setCart([]);
          setProcessing(false);
          setSelectedCustomerId("");
          setCustomerSearch("");
          setCustomerName("");
          setCustomerEmail("");
          setCustomerPhone("+254");
          setDiscountValue("");
          setDiscountReason("");
          setDeliveryEnabled(false);
          setDeliveryLocation("");
          setDeliveryAddressLine("");
          setDeliveryRecipientName("");
          setDeliveryRecipientPhone("");
          setDeliveryFee("");
          return;
        }

        if (payload.state === "failed") {
          setMessage(payload.message || "M-PESA payment failed.");
          setPaymentReference(null);
          setProcessing(false);
          return;
        }

        setMessage(payload.message || "Waiting for the customer to complete the payment…");
      } catch (cause) {
        if (!stopped) setMessage(cause instanceof Error ? cause.message : "Unable to verify M-PESA payment.");
      }

      if (!stopped && attempts < 18) {
        timer = window.setTimeout(check, 10_000);
      } else if (!stopped) {
        try {
          await fetch("/api/backoffice/pos/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: paymentReference, action: "timeout" }),
          });
        } catch {
          // Reconciliation remains available even if the timeout marker fails.
        }
        setProcessing(false);
        setPaymentReference(null);
        setMessage("Payment confirmation timed out. It has been flagged for reconciliation before another payment is attempted.");
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
      .filter((product) => !term || [product.name, product.sku, product.category].some((value) => value?.toLowerCase().includes(term)));
  }, [products, search]);

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discountNumeric = Math.max(0, Number(discountValue || 0));
  const discountAmount = manager
    ? Math.min(
        subtotal,
        discountType === "percent"
          ? subtotal * (Math.min(discountNumeric, 100) / 100)
          : discountNumeric,
      )
    : 0;
  const productRevenue = Math.max(0, subtotal - discountAmount);
  const deliveryPayable = deliveryEnabled ? Math.max(0, Number(deliveryFee || 0)) : 0;
  const total = productRevenue + deliveryPayable;
  const units = cart.reduce((sum, line) => sum + line.quantity, 0);

  function selectedVariant(product: StoreProduct) {
    const selectedId = variantSelections[product.id];
    return product.variants?.find((variant) => variant.id === selectedId) || product.variants?.[0];
  }

  function addProduct(product: StoreProduct) {
    const variant = selectedVariant(product);
    const key = `${product.id}|${variant?.id || "default"}`;
    const unitPrice = getQuantityUnitPrice(product, 1, variant?.price);
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
      return current.map((line, currentIndex) => {
        if (currentIndex !== index) return line;
        const nextQuantity = line.quantity + 1;
        return {
          ...line,
          quantity: nextQuantity,
          unitPrice: getQuantityUnitPrice(product, nextQuantity, variant?.price),
        };
      });
    });
  }

  function changeQuantity(key: string, delta: number) {
    setCart((current) => current
      .map((line) => {
        if (line.key !== key) return line;
        const nextQuantity = Math.max(0, line.quantity + delta);
        const product = products.find((item) => item.id === line.productId);
        const variantPrice = product?.variants?.find((variant) => variant.id === line.variantId)?.price;
        return {
          ...line,
          quantity: nextQuantity,
          unitPrice: product ? getQuantityUnitPrice(product, nextQuantity, variantPrice) : line.unitPrice,
        };
      })
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
    if (manager && discountNumeric > 0 && !discountReason.trim()) {
      setMessage("Enter a reason for the authorised discount.");
      return;
    }
    if (paymentMethod === "manual") {
      if (!manualPaymentName.trim()) {
        setMessage("Enter the name of the person who made the external payment.");
        return;
      }
      if (manualPaymentReference.trim().length < 5) {
        setMessage("Enter the M-PESA code or external payment reference.");
        return;
      }
      if (!Number.isFinite(Number(manualAmountReceived)) || Number(manualAmountReceived) <= 0) {
        setMessage("Enter the amount received outside the system.");
        return;
      }
      if (!manualPaymentConfirmed) {
        setMessage("Confirm that you independently checked the external payment before recording it.");
        return;
      }
    }

    if (deliveryEnabled) {
      if (!deliveryLocation.trim()) {
        setMessage("Enter or select the delivery destination.");
        return;
      }
      if (!Number.isFinite(deliveryPayable) || deliveryPayable < 0) {
        setMessage("Enter a valid delivery payable amount (0 is allowed for free delivery).");
        return;
      }
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
          deliveryLocation: deliveryEnabled ? deliveryLocation.trim() : undefined,
          deliveryAddressLine: deliveryEnabled ? deliveryAddressLine.trim() : undefined,
          deliveryRecipientName: deliveryEnabled ? deliveryRecipientName.trim() : undefined,
          deliveryRecipientPhone: deliveryEnabled ? deliveryRecipientPhone.trim() : undefined,
          deliveryFee: deliveryEnabled ? deliveryPayable : 0,
          customerId: selectedCustomerId || undefined,
          customerName,
          customerEmail,
          customerPhone,
          manualPaymentName: paymentMethod === "manual" ? manualPaymentName.trim() : undefined,
          manualPaymentReference: paymentMethod === "manual" ? manualPaymentReference.trim() : undefined,
          manualAmountReceived: paymentMethod === "manual" ? Number(manualAmountReceived) : undefined,
          manualPaymentConfirmed: paymentMethod === "manual" ? manualPaymentConfirmed : undefined,
          discount: manager && discountNumeric > 0
            ? { type: discountType, value: discountNumeric, reason: discountReason }
            : undefined,
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

      if (paymentMethod === "manual") {
        setMessage(payload.displayText || "Manual payment recorded for reconciliation.");
        if (payload.orderId) {
          setLastReceipt({ orderId: payload.orderId, receiptNumber: payload.receiptNumber });
          setSaleCompletion({
            kind: "manual",
            orderId: payload.orderId,
            orderNumber: payload.orderNumber,
            receiptNumber: payload.receiptNumber,
          });
        }
        setCart([]); setProcessing(false); setSelectedCustomerId(""); setCustomerSearch(""); setCustomerName(""); setCustomerEmail(""); setCustomerPhone("+254");
        setDiscountValue(""); setDiscountReason(""); setDeliveryEnabled(false); setDeliveryLocation(""); setDeliveryAddressLine(""); setDeliveryRecipientName(""); setDeliveryRecipientPhone(""); setDeliveryFee("");
        setManualPaymentName(""); setManualPaymentReference(""); setManualAmountReceived(""); setManualPaymentConfirmed(false);
        return;
      }

      if (!payload.reference) throw new Error("Payment started without a payment reference.");
      const prefix = payload.testMode ? "Daraja sandbox: " : "";
      setMessage(`${prefix}${payload.displayText || "Ask the customer to complete the M-PESA payment."}`);
      setPaymentReference(payload.reference);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "POS sale failed.");
      setProcessing(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-73px)] min-h-0 w-full flex-col overflow-hidden bg-[var(--paper-2)] text-[var(--ink)] font-sans antialiased lg:h-full">
      {/* POS Top Command Bar */}
      <header className="z-20 flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b hairline bg-[var(--paper)] px-3 py-2.5 sm:px-6 lg:h-16 lg:flex-nowrap lg:px-8 lg:py-0">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[var(--brand-green)] text-soft-cream shadow-sm">
            <Store size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">Point of Sale</h1>
              <span className="hidden items-center gap-1 rounded-full bg-[var(--brand-green)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--brand-green)] min-[420px]:inline-flex">
                <span className="size-1.5 rounded-full bg-[var(--brand-green)] animate-pulse" /> Live Terminal
              </span>
            </div>
            <p className="hidden text-xs text-[var(--muted)] sm:block">In-store transactions & register</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`${basePath}/pos/operations`}
            className="hidden h-10 items-center gap-2 rounded-full border hairline bg-[var(--paper)] px-4 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-green)] transition hover:bg-[var(--paper-2)] md:inline-flex"
          >
            <ReceiptText size={14} /> Sales operations
          </Link>
          {lastReceipt && (
            <Link
              href={`${basePath}/pos/receipt/${encodeURIComponent(lastReceipt.orderId)}`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--brand-green)] px-3 text-[10px] font-bold uppercase tracking-wider text-soft-cream sm:px-4"
            >
              <ReceiptText size={14} /> {lastReceipt.receiptNumber || "Receipt"}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setSalePanelExpanded(true)}
            className="inline-flex h-10 max-w-[58vw] items-center gap-2 rounded-full bg-[var(--brand-green)] px-3 text-[11px] font-semibold text-soft-cream shadow-sm transition-transform active:scale-95 sm:max-w-none sm:px-4 sm:text-xs lg:hidden"
            aria-label="Open current sale"
          >
            <ShoppingCart size={15} className="shrink-0" />
            <span className="whitespace-nowrap">{units} items</span>
            <span className="opacity-40">|</span>
            <span className="truncate">{formatMoney(total)}</span>
          </button>
        </div>
      </header>

      {/* Status Notification Banner */}
      {message && (
        <div role="status" className="flex shrink-0 items-start gap-2 border-b hairline bg-[var(--brand-green)]/5 px-4 py-2.5 text-xs font-medium leading-5 text-[var(--brand-green)] sm:items-center sm:gap-3 sm:px-6">
          <AlertCircle size={16} className="shrink-0 text-[var(--brand-green)]" />
          <span className="flex-1">{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-[10px] uppercase font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main POS Interface Grid */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Pane: Catalog & Selection */}
        <section id="pos-catalog-panel" className="flex min-w-0 flex-1 flex-col bg-[var(--paper)] lg:border-r lg:hairline">
          {/* Search Bar & Stats */}
          <div className="flex flex-wrap items-center gap-3 border-b hairline p-3 sm:p-4 sm:px-6">
            <div className="relative min-w-0 flex-[1_1_220px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search catalog by product name, SKU, or category..."
                className="h-11 w-full rounded-xl border hairline bg-[var(--paper-2)] pl-10 pr-4 text-xs outline-none transition focus:border-[var(--brand-green)] focus:bg-[var(--paper)] focus:ring-2 focus:ring-[var(--brand-green)]/10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--muted)]">
              <span className="rounded-md bg-[var(--paper-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink)]">
                {filtered.length}
              </span>
              <span>{search.trim() ? "Matching products" : "Products available"}</span>
              {!search.trim() && products.length !== filtered.length && (
                <span className="text-[10px]">of {products.length} POS-enabled</span>
              )}
            </div>
          </div>

          {/* Product Grid Area */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 [scrollbar-width:thin]">
            {loading ? (
              <div className="grid h-full place-items-center">
                <div className="flex flex-col items-center gap-3 text-xs text-[var(--muted)]">
                  <RefreshCw size={24} className="animate-spin text-[var(--brand-green)]" />
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
              <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((product) => {
                  const variant = selectedVariant(product);
                  const image = variant?.imageUrl || product.heroImage;
                  return (
                    <article
                      key={product.id}
                      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border hairline bg-[var(--paper)] transition-all hover:border-[var(--brand-green)]/40 hover:shadow-md"
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
                          <span className="absolute right-2 top-2 rounded-full bg-[var(--paper)]/90 px-2 py-0.5 text-[9px] font-semibold tracking-tight text-[var(--brand-green)] shadow-sm backdrop-blur-md">
                            {stockLabel(product, variant)}
                          </span>
                        </div>

                        {/* Content */}
                        <div className="p-3">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug group-hover:text-[var(--brand-green)]">
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
                                  className="h-8 w-full appearance-none rounded-lg border hairline bg-[var(--paper-2)] pl-2.5 pr-7 text-[10px] font-medium outline-none transition focus:border-[var(--brand-green)]"
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
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--brand-green)] px-3 text-[10px] font-semibold uppercase tracking-wider text-soft-cream shadow-xs transition-transform active:scale-95"
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
          className={salePanelExpanded
            ? "fixed inset-0 z-[90] flex h-[100dvh] w-screen flex-col overflow-hidden bg-[var(--paper)] shadow-2xl"
            : "hidden min-h-0 shrink-0 flex-col overflow-hidden border-l hairline bg-[var(--paper)] lg:flex lg:w-[440px] xl:w-[500px]"}
        >
          {/* Order Header */}
          <div className="flex items-center justify-between border-b hairline p-4 sm:px-6">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-[var(--brand-green)]" />
              <h2 className="text-sm font-semibold tracking-tight">Current Sale</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--paper-2)] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[var(--brand-green)]">
                {units} {units === 1 ? "unit" : "units"}
              </span>
              <button
                type="button"
                onClick={() => setSalePanelExpanded((current) => !current)}
                className="inline-grid size-9 place-items-center rounded-full border hairline bg-[var(--paper)] transition hover:border-[var(--brand-green)]"
                aria-label={salePanelExpanded ? "Exit full screen current sale" : "Open current sale full screen"}
                title={salePanelExpanded ? "Exit full screen (Esc)" : "Full screen current sale"}
              >
                {salePanelExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>

          <div className={salePanelExpanded ? "grid min-h-0 flex-1 grid-rows-[minmax(180px,0.8fr)_minmax(0,1.2fr)] lg:grid-cols-[1.15fr_0.85fr] lg:grid-rows-1" : "flex min-h-0 flex-1 flex-col"}>
          {/* Cart Item Stream */}
          <div className={`overflow-y-auto p-4 sm:p-6 space-y-2.5 [scrollbar-width:thin] ${salePanelExpanded ? "min-h-0 flex-1 border-r hairline" : "min-h-[120px] max-h-[34%] shrink-0"}`}>
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
                  className="group relative flex flex-col justify-between rounded-xl border hairline bg-[var(--paper-2)] p-3 transition-colors hover:border-[var(--brand-green)]/30"
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
          <div className={`min-h-0 flex-1 overflow-y-auto border-t hairline bg-[var(--paper-2)] p-4 pb-28 sm:p-6 sm:pb-32 space-y-4 [scrollbar-width:thin] ${salePanelExpanded ? "lg:border-t-0" : ""}`}>
            {/* Customer Inputs */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Customer Information</span>
              <div className="grid gap-2">
                <div className="relative">
                  <UserRoundSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setSelectedCustomerId("");
                    }}
                    placeholder="Find existing customer"
                    className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                  {customerMatches.length > 0 && !selectedCustomerId && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-xl border hairline bg-[var(--paper)] p-1 shadow-xl">
                      {customerMatches.map((customer) => (
                        <button
                          key={customer._id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomerId(customer._id);
                            setCustomerSearch(customer.name);
                            setCustomerName(customer.name);
                            updateCustomerPhone(customer.phone || "+254");
                            setCustomerEmail(customer.email || "");
                            setCustomerMatches([]);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--paper-2)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold">{customer.name}</span>
                            <span className="block truncate text-[10px] text-[var(--muted)]">
                              {customer.phone}{customer.email ? ` · ${customer.email}` : ""}
                            </span>
                          </span>
                          {Number(customer.outstandingBalance || 0) > 0 && (
                            <span className="shrink-0 text-[9px] font-semibold text-amber-700">
                              Due {formatMoney(Number(customer.outstandingBalance || 0))}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Full Name *"
                    required
                    className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      value={customerPhone}
                      onChange={(e) => updateCustomerPhone(e.target.value)}
                      placeholder="+254..."
                      maxLength={13}
                      required
                      className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs font-mono outline-none focus:border-[var(--brand-green)]"
                    />
                  </div>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (Optional)"
                      type="email"
                      className="h-9 w-full rounded-lg border hairline bg-[var(--paper)] pl-9 pr-3 text-xs outline-none focus:border-[var(--brand-green)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {manager && (
              <div className="space-y-2 rounded-xl border hairline bg-[var(--paper)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Authorised Discount</span>
                  <Percent size={14} className="text-[var(--brand-green)]" />
                </div>
                <div className="grid gap-2 min-[420px]:grid-cols-[105px_1fr]">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-2 text-[10px] font-semibold outline-none"
                  >
                    <option value="percent">Percent %</option>
                    <option value="fixed">Fixed KES</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="Discount value"
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                </div>
                <input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="Reason required when discount is applied"
                  className="h-9 w-full rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                />
                {discountAmount > 0 && (
                  <p className="text-[10px] text-[var(--muted)]">
                    Discount <strong className="text-[var(--ink)]">-{formatMoney(discountAmount)}</strong> · New total {formatMoney(total)}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-xl border hairline bg-[var(--paper)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Delivery Payable</span>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Pass-through delivery money: collected from the customer but excluded from business revenue.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.05em]">
                  <input type="checkbox" checked={deliveryEnabled} onChange={(event) => setDeliveryEnabled(event.target.checked)} className="size-4 accent-[var(--brand-green)]" />
                  Add delivery
                </label>
              </div>
              {deliveryEnabled && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <input
                      list="pos-delivery-destinations"
                      value={deliveryLocation}
                      onChange={(event) => setDeliveryLocation(event.target.value)}
                      placeholder="Town / delivery area e.g. Nairobi"
                      className="h-9 w-full rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                    />
                    <datalist id="pos-delivery-destinations">
                      <option value="Nairobi" />
                      <option value="Kiambu" />
                      <option value="Kisumu" />
                      <option value="Mombasa" />
                      <option value="Nakuru" />
                      <option value="Eldoret" />
                    </datalist>
                  </div>
                  <input
                    value={deliveryAddressLine}
                    onChange={(event) => setDeliveryAddressLine(event.target.value)}
                    placeholder="Address / estate / landmark"
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                  <input
                    value={deliveryRecipientName}
                    onChange={(event) => setDeliveryRecipientName(event.target.value)}
                    placeholder={`Recipient name · defaults to ${customerName || "customer"}`}
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                  <input
                    value={deliveryRecipientPhone}
                    onChange={(event) => setDeliveryRecipientPhone(event.target.value)}
                    placeholder={`Recipient phone · defaults to ${customerPhone || "+254..."}`}
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)]"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={deliveryFee}
                    onChange={(event) => setDeliveryFee(event.target.value)}
                    placeholder="Delivery amount KES"
                    className="h-9 rounded-lg border hairline bg-[var(--paper-2)] px-3 text-xs outline-none focus:border-[var(--brand-green)] sm:col-span-2"
                  />
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Payment Method</span>
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("mpesa")}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-semibold transition-all ${
                    paymentMethod === "mpesa"
                      ? "border-[var(--brand-green)] bg-[var(--brand-green)] text-soft-cream shadow-xs"
                      : "border-hairline bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                  }`}
                >
                  <Smartphone size={14} /> Direct M-PESA
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("manual")}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[10px] font-semibold transition-all ${
                    paymentMethod === "manual"
                      ? "border-[var(--brand-green)] bg-[var(--brand-green)] text-soft-cream shadow-xs"
                      : "border-hairline bg-[var(--paper)] hover:bg-[var(--paper-2)]"
                  }`}
                >
                  <HandCoins size={14} /> Manual Payment
                </button>
              </div>

              <p className="rounded-lg border hairline bg-[var(--paper)] p-2.5 text-[11px] leading-normal text-[var(--muted)]">
                {paymentMethod === "mpesa"
                  ? <>Send a direct Safaricom Daraja STK Push to the customer&apos;s phone. The sale, stock deduction and receipt are finalized only after M-PESA confirms payment.</>
                  : <>Record a payment the customer already made outside this system. The reference is checked against Decor by Kasiwa records for duplicates, but it is <strong>not independently verified with Safaricom</strong>. Use Direct M-PESA for automatic verification.</>}
              </p>
              {paymentMethod === "manual" && (
                <div className="grid gap-2 rounded-xl border hairline bg-[var(--paper-2)] p-3">
                  <input value={manualPaymentName} onChange={(event) => setManualPaymentName(event.target.value)} placeholder="Paid by / payer name" className="h-9 rounded-lg border hairline bg-white px-3 text-xs outline-none focus:border-[var(--brand-green)]" />
                  <input value={manualPaymentReference} onChange={(event) => setManualPaymentReference(event.target.value.toUpperCase())} placeholder="M-PESA code / payment reference" className="h-9 rounded-lg border hairline bg-white px-3 text-xs uppercase outline-none focus:border-[var(--brand-green)]" />
                  <input type="number" min="0" step="0.01" value={manualAmountReceived} onChange={(event) => setManualAmountReceived(event.target.value)} placeholder={`Amount received · ${formatMoney(total)}`} className="h-9 rounded-lg border hairline bg-white px-3 text-xs outline-none focus:border-[var(--brand-green)]" />
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] leading-4 text-amber-900">
                    <input
                      type="checkbox"
                      checked={manualPaymentConfirmed}
                      onChange={(event) => setManualPaymentConfirmed(event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--brand-green)]"
                    />
                    <span>I have independently confirmed that the funds were received. Manual M-PESA/reference entries are not verified with Safaricom by this screen.</span>
                  </label>
                </div>
              )}
            </div>

            {/* Total Summary & Checkout Button */}
            <div className="sticky bottom-0 z-20 -mx-4 space-y-3 border-t hairline bg-[var(--paper-2)] px-4 pb-2 pt-3 shadow-[0_-12px_24px_rgba(0,0,0,0.04)] sm:-mx-6 sm:px-6">
              {discountAmount > 0 && (
                <div className="grid gap-1 border-t hairline pt-3 text-[10px] text-[var(--muted)]">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
                  <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(discountAmount)}</span></div>
                </div>
              )}
              {deliveryPayable > 0 && (
                <div className="grid gap-1 border-t hairline pt-3 text-[10px] text-[var(--muted)]">
                  <div className="flex justify-between"><span>Business revenue</span><span>{formatMoney(productRevenue)}</span></div>
                  <div className="flex justify-between"><span>Delivery payable · {deliveryLocation || "Destination"}</span><span>{formatMoney(deliveryPayable)}</span></div>
                </div>
              )}
              <div className={`flex items-baseline justify-between ${discountAmount > 0 || deliveryPayable > 0 ? "" : "border-t hairline pt-3"}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Money In</span>
                <span className="text-2xl font-extrabold tracking-tight tabular-nums text-[var(--brand-green)]">
                  {formatMoney(total)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void completeSale()}
                disabled={processing || cart.length === 0}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-green)] text-xs font-bold uppercase tracking-wider text-soft-cream shadow-md transition-all hover:bg-[var(--brand-green)]/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {processing ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Processing Order...
                  </span>
                ) : paymentMethod === "mpesa" ? (
                  <span className="inline-flex items-center gap-2">
                    <Smartphone size={16} /> Send M-PESA Prompt
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <HandCoins size={16} /> Record Manual Payment
                  </span>
                )}
              </button>
            </div>
          </div>
          </div>
        </aside>
      </div>

      {saleCompletion && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/45 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-sale-complete-title"
            className="w-full max-w-md rounded-3xl border hairline bg-[var(--paper)] p-6 text-center shadow-2xl sm:p-8"
          >
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--brand-green)]/10 text-[var(--brand-green)]">
              <CheckCircle2 size={30} strokeWidth={2.2} />
            </div>
            <h3 id="pos-sale-complete-title" className="mt-4 text-xl font-semibold">
              {saleCompletion.kind === "mpesa" ? "Payment received" : "Manual payment recorded"}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {saleCompletion.kind === "mpesa"
                ? "Safaricom M-PESA has confirmed the payment and the sale is complete."
                : "The external payment has been recorded for reconciliation. It has not been independently verified with Safaricom."}
            </p>
            {saleCompletion.orderNumber && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink)]">
                {saleCompletion.orderNumber}
              </p>
            )}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Link
                href={`${basePath}/pos/receipt/${encodeURIComponent(saleCompletion.orderId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold text-soft-cream"
              >
                <ReceiptText size={15} /> View / Print receipt
              </Link>
              <button
                type="button"
                onClick={() => setSaleCompletion(null)}
                className="min-h-11 rounded-full border hairline bg-[var(--paper)] px-4 text-xs font-semibold hover:bg-[var(--paper-2)]"
              >
                Continue selling
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
