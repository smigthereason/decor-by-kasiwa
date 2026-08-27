"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney } from "@/lib/money";

type VerifiedOrderItem = {
  productId: string;
  name: string;
  finish?: string;
  quantity: number;
  unitPrice: number;
};

type VerifiedAddress = {
  fullName: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  country: string;
};

type VerifiedOrder = {
  orderId: string;
  orderNumber: string;
  reference: string;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  paymentMethod: string;

  subtotal: number;
  deliveryFee: number;
  total: number;

  deliveryAddress: VerifiedAddress;

  items: VerifiedOrderItem[];
};

type VerifyResponse = {
  message?: string;
  order?: VerifiedOrder;
};

function SuccessContent() {
  const searchParams = useSearchParams();

  const reference =
    searchParams.get("reference");

  const {
    user,
    clearCart,
  } = useCommerce();

  const [state, setState] =
    useState<
      "verifying" | "success" | "error"
    >(
      reference
        ? "verifying"
        : "error",
    );

  const [message, setMessage] =
    useState(
      reference
        ? "Confirming your Paystack payment…"
        : "Payment reference is missing.",
    );

  const [order, setOrder] =
    useState<VerifiedOrder | null>(
      null,
    );

  /*
   * Keeps the latest clearCart implementation
   * without making our payment verification
   * effect depend on its function identity.
   */
  const clearCartRef =
    useRef(clearCart);

  useEffect(() => {
    clearCartRef.current =
      clearCart;
  }, [clearCart]);

  /*
   * Prevent the same Paystack reference from
   * being verified repeatedly because of:
   *
   * - CommerceProvider re-renders
   * - local state changes
   * - React Strict Mode development behaviour
   */
  const verificationStartedRef =
    useRef<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setState("error");
      setMessage(
        "Payment reference is missing.",
      );

      return;
    }

    const paymentReference =
      reference;

    /*
     * This reference has already started
     * verification in this mounted page.
     */
    if (
      verificationStartedRef.current ===
      paymentReference
    ) {
      return;
    }

    verificationStartedRef.current =
      paymentReference;

    let cancelled = false;

    async function verifyPayment() {
      try {
        const response =
          await fetch(
            `/api/paystack/verify?reference=${encodeURIComponent(
              paymentReference,
            )}`,
            {
              method: "GET",
              cache: "no-store",
            },
          );

        const payload =
          (await response.json()) as VerifyResponse;

        if (
          !response.ok ||
          !payload.order
        ) {
          throw new Error(
            payload.message ||
              "Payment verification failed.",
          );
        }

        if (cancelled) {
          return;
        }

        setOrder(
          payload.order,
        );

        setState(
          "success",
        );

        setMessage(
          "Payment verified.",
        );

        /*
         * Clear the cart only AFTER the server
         * confirms the payment and finalizes
         * the order.
         */
        clearCartRef.current();
      } catch (cause) {
        if (cancelled) {
          return;
        }

        setState(
          "error",
        );

        setMessage(
          cause instanceof Error
            ? cause.message
            : "We could not verify this payment. Please contact Decor by Kasiwa with your Paystack reference.",
        );
      }
    }

    void verifyPayment();

    return () => {
      cancelled = true;
    };
  }, [reference]);

  if (
    state === "verifying"
  ) {
    return (
      <section className="grid min-h-[calc(100vh-140px)] place-items-center bg-[var(--paper)] px-5">
        <div className="max-w-lg text-center">
          <LoaderCircle
            size={30}
            className="mx-auto animate-spin text-[var(--deep-green)]"
          />

          <p className="kicker mt-5 text-[var(--muted)]">
            Secure payment
          </p>

          <h1 className="mt-3 text-[clamp(2.6rem,7vw,5.5rem)] font-medium leading-[0.92] tracking-[-0.06em]">
            Veryfying Payment.
          </h1>

          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-[var(--muted)]">
            {message}
          </p>
        </div>
      </section>
    );
  }

  if (
    state === "error" ||
    !order
  ) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
        <div className="flex flex-1 items-center justify-center px-4 py-20">
          <div className="max-w-2xl text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-700">
              <AlertTriangle
                size={20}
              />
            </div>

            <p className="kicker mt-6 text-[var(--muted)]">
              Payment verification
            </p>

            <h1 className="mt-4 text-[clamp(3rem,7vw,6rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              WE COULD NOT
              CONFIRM IT YET.
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
              {message}
            </p>

            {reference && (
              <p className="mt-5 inline-flex rounded-full bg-[var(--paper-2)] px-4 py-2 text-xs font-medium">
                Paystack reference:{" "}
                {reference}
              </p>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-2">
              <Link
                href="/checkout"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
              >
                Return to checkout
              </Link>

              <Link
                href="/shop"
                className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/shop"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowRight
            size={13}
            className="rotate-180 transition-transform group-hover:-translate-x-1"
          />

          Continue shopping
        </Link>

        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <LockKeyhole
            size={12}
            strokeWidth={1.5}
          />

          <span>
            Payment verified
          </span>
        </div>
      </div>

      <div className="border-b hairline px-4 py-16 text-center md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--deep-green)]">
            <Check
              size={20}
              strokeWidth={2.5}
              className="text-[var(--paper)]"
            />
          </div>

          <p className="kicker mt-6 text-[var(--muted)]">
            Order confirmed
          </p>

          <h1 className="mt-4 text-[clamp(3rem,8vw,7rem)] font-medium leading-[0.9] tracking-[-0.06em]">
            Thank You.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Your Paystack payment has
            been verified and your
            live order has been
            created in Decor by
            Kasiwa&apos;s fulfilment
            workflow.
          </p>

          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-4 py-2 text-sm font-medium">
            Order:{" "}
            {order.orderNumber}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link
              href="/shop"
              className="focus-ring group inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:gap-3"
            >
              <span>
                Continue shopping
              </span>

              <ArrowRight
                size={13}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>

            <Link
              href="/account"
              className="focus-ring inline-flex items-center gap-2 rounded-full border hairline px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all hover:border-[var(--ink)]"
            >
              {user
                ? "View account"
                : "Sign in with Google"}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid flex-1 md:grid-cols-2">
        <div className="border-b hairline p-4 md:border-b-0 md:border-r md:p-8 lg:p-10">
          <p className="kicker text-[var(--muted)]">
            Delivery To
          </p>

          <div className="mt-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
            <p className="text-sm font-medium">
              {
                order
                  .deliveryAddress
                  .fullName
              }
            </p>

            <p className="mt-1 text-xs text-[var(--muted)]">
              {
                order.customerEmail
              }{" "}
              ·{" "}
              {
                order
                  .deliveryAddress
                  .phone
              }
            </p>

            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              {
                order
                  .deliveryAddress
                  .address1
              }

              {order
                .deliveryAddress
                .address2 && (
                <>
                  <br />

                  {
                    order
                      .deliveryAddress
                      .address2
                  }
                </>
              )}

              <br />

              {
                order
                  .deliveryAddress
                  .city
              }
              ,{" "}
              {
                order
                  .deliveryAddress
                  .region
              }

              <br />

              {
                order
                  .deliveryAddress
                  .country
              }
            </p>
          </div>
        </div>

        <div className="p-4 md:p-8 lg:p-10">
          <p className="kicker text-[var(--muted)]">
            Order Summary
          </p>

          <div className="mt-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
            <div className="divide-y hairline">
              {order.items.map(
                (line) => (
                  <div
                    key={`${line.productId}-${line.finish || "default"}`}
                    className="flex justify-between gap-4 py-3 text-xs"
                  >
                    <span>
                      {line.quantity} ×{" "}
                      {line.name}

                      {line.finish
                        ? ` (${line.finish})`
                        : ""}
                    </span>

                    <span className="whitespace-nowrap font-medium">
                      {formatMoney(
                        line.unitPrice *
                          line.quantity,
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>

            <div className="mt-4 space-y-2 border-t hairline pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">
                  Subtotal
                </span>

                <span>
                  {formatMoney(
                    order.subtotal,
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[var(--muted)]">
                  Delivery
                </span>

                <span>
                  {formatMoney(
                    order.deliveryFee,
                  )}
                </span>
              </div>

              <div className="flex justify-between pt-2 font-semibold">
                <span>
                  Total
                </span>

                <span>
                  {formatMoney(
                    order.total,
                  )}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm font-bold text-[var(--muted)]">
            Payment method:{" "}
            {order.paymentMethod}
          </p>

          <p className="mt-2 break-all text-xs text-[var(--muted)]">
            Paystack reference:{" "}
            {order.reference}
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
