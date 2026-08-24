"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney, getProductById } from "@/lib/products";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const { orders, user } = useCommerce();
  const order = orders.find((item) => item.id === orderId) || orders[0];

  if (!order) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
        <div className="flex flex-1 items-center justify-center px-4 py-20">
          <div className="text-center">
            <p className="kicker text-[var(--muted)]">Order Not Found</p>
            <h1 className="mt-4 text-[clamp(3rem,7vw,6rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              NO ORDER FOUND.
            </h1>
            <Link
              href="/shop"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <span>Continue shopping</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
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
          <ArrowRight size={13} className="rotate-180 transition-transform group-hover:-translate-x-1" />
          Continue shopping
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <LockKeyhole size={12} strokeWidth={1.5} />
          <span>Order Confirmed</span>
        </div>
      </div>

      {/* SUCCESS MESSAGE */}
      <div className="border-b hairline px-4 py-16 text-center md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--deep-green)]">
            <Check size={20} strokeWidth={2.5} className="text-[var(--paper)]" />
          </div>
          <p className="kicker mt-6 text-[var(--muted)]">Order Received</p>
          <h1 className="mt-4 text-[clamp(3rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.06em]">
            Thank You.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            The prototype checkout is complete. No payment was processed. In the production build this page should be reached only after the chosen payment provider confirms the transaction or payment intent.
          </p>
          {order && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 py-2 text-sm font-medium">
              Reference: {order.id}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link
              href="/shop"
              className="focus-ring group inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <span>Continue shopping</span>
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href={user ? "/account" : "/account/register"}
              className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
            >
              {user ? "View account" : "Create an account"}
            </Link>
          </div>
        </div>
      </div>

      {/* ORDER DETAILS */}
      <div className="grid flex-1 md:grid-cols-2">
        {/* DELIVERY ADDRESS */}
        <div className="border-b hairline p-4 md:border-b-0 md:border-r md:p-8 lg:p-10">
          <p className="kicker text-[var(--muted)]">Delivery To</p>
          <div className="mt-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
            <p className="text-sm font-medium">{order.address.fullName}</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {order.address.address1}
              {order.address.address2 && (
                <>
                  <br />
                  {order.address.address2}
                </>
              )}
              <br />
              {order.address.city}, {order.address.region}
              <br />
              {order.address.country}
            </p>
          </div>
        </div>

        {/* ORDER SUMMARY */}
        <div className="p-4 md:p-8 lg:p-10">
          <p className="kicker text-[var(--muted)]">Order Summary</p>
          <div className="mt-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
            {order.items && order.items.length > 0 ? (
              <>
                <div className="divide-y hairline">
                  {order.items.map((line) => {
                    const product = getProductById(line.productId);
                    if (!product) return null;
                    return (
                      <div
                        key={`${line.productId}-${line.colour || "default"}`}
                        className="flex justify-between gap-4 py-3 text-xs"
                      >
                        <span>
                          {line.quantity} × {product.name}
                          {line.colour ? ` (${line.colour})` : ""}
                        </span>
                        <span className="whitespace-nowrap font-medium">
                          {formatMoney(product.price * line.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-between border-t hairline pt-4 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(order.subtotal)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatMoney(order.subtotal)}</span>
              </div>
            )}
          </div>
          <p className="mt-4 text-sm text-[var(--muted)] font-bold">
            Payment method: {order.paymentMethod}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center bg-[var(--paper)]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Loading order…
            </p>
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
