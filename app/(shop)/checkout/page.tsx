"use client";

import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Landmark,
  LockKeyhole,
  Smartphone,
  ShieldCheck,
  Truck,
  Package,
  LoaderCircle,
} from "lucide-react";

import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import CatalogueUnavailable from "@/components/root/commerce/CatalogueUnavailable";
import { formatMoney } from "@/lib/money";
import type { DemoAddress } from "@/types/commerce";

const emptyAddress: DemoAddress = {
  fullName: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  country: "",
};

const steps = [
  { number: 1, label: "Contact" },
  { number: 2, label: "Delivery" },
  { number: 3, label: "Payment" },
] as const;

const paymentMethods = [
  { id: "Card", label: "Credit or Debit Card", body: "Visa, Mastercard, American Express", icon: CreditCard },
  { id: "Mobile money", label: "Mobile Money", body: "M-Pesa / Phone payment", icon: Smartphone },
  { id: "Bank transfer", label: "Bank Transfer", body: "Wire transfer details provided post-checkout", icon: Landmark },
] as const;

export default function CheckoutPage() {
  const { hydrated, catalogueReady, catalogueError, cart, subtotal, user, getProductById } = useCommerce();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<DemoAddress>(emptyAddress);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [error, setError] = useState("");
  const [initializingPayment, setInitializingPayment] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail((current) => current || user.email);
    setAddress((current) => ({
      ...current,
      fullName: current.fullName || user.name,
    }));
  }, [user]);

  const lineItems = useMemo(
    () =>
      cart
        .map((line) => ({ line, product: getProductById(line.productId) }))
        .filter((item) => Boolean(item.product)),
    [cart, getProductById]
  );

  if (!hydrated || !catalogueReady) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[var(--paper)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10" />
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Preparing checkout…
          </p>
        </div>
      </div>
    );
  }

  if (catalogueError) {
    return <CatalogueUnavailable message={catalogueError} />;
  }

  if (cart.length === 0) {
    return (
      <section className="flex min-h-[calc(100vh-140px)] w-full flex-col justify-center border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Checkout</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(3.8rem,9vw,8rem)] font-medium leading-[0.88] tracking-[-0.075em]">
          YOUR SELECTION IS EMPTY.
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

  function validateStep(nextStep: number) {
    setError("");
    if (step === 1 && nextStep > 1) {
      if (!email.trim() || !email.includes("@")) {
        setError("Please enter a valid email address to continue.");
        return false;
      }
    }
    if (step === 2 && nextStep > 2) {
      const required = [address.fullName, address.phone, address.address1, address.city, address.region, address.country];
      if (required.some((value) => !value.trim())) {
        setError("Please complete all required delivery details.");
        return false;
      }
    }
    return true;
  }

  function continueTo(nextStep: number) {
    if (validateStep(nextStep)) {
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (initializingPayment) return;

    if (!validateStep(3)) return;

    setInitializingPayment(true);

    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          address,
          cart,
          paymentMethod,
        }),
      });

      const payload = (await response.json()) as {
        authorizationUrl?: string;
        reference?: string;
        message?: string;
      };

      if (!response.ok || !payload.authorizationUrl) {
        throw new Error(payload.message || "Unable to start Paystack checkout.");
      }

      window.location.assign(payload.authorizationUrl);
    } catch (paymentError) {
      console.error("Unable to initialize Paystack:", paymentError);
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to start secure payment. Please try again.",
      );
      setInitializingPayment(false);
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* TOP BAR */}
      <div className="border-b hairline bg-[var(--paper)]">
        <div className="flex w-full items-center justify-between px-4 py-4 sm:px-6 md:px-8">
          <Link
            href="/cart"
            className="focus-ring group inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
            <span className="hidden sm:inline">Back to bag</span>
            <span className="sm:hidden">Back</span>
          </Link>

          <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] md:inline-flex">
            <ShieldCheck size={14} strokeWidth={1.5} />
            <span>Secure Checkout</span>
          </div>

          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            <LockKeyhole size={12} strokeWidth={1.5} />
            <span className="hidden sm:inline">Encrypted</span>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col lg:flex-row">

        {/* LEFT COLUMN: FORM */}
        <div className="flex flex-1 flex-col">
          {/* STEPPER */}
          <div className="border-b hairline bg-[var(--paper)]">
            <div className="flex items-center justify-between px-4 py-5 sm:px-6 md:px-8">
              {steps.map((item, idx) => {
                const active = item.number === step;
                const complete = item.number < step;
                return (
                  <div key={item.number} className="flex flex-1 items-center">
                    <button
                      type="button"
                      disabled={item.number > step}
                      onClick={() => {
                        if (item.number < step) {
                          setStep(item.number);
                          setError("");
                        }
                      }}
                      className={[
                        "group flex items-center gap-2 sm:gap-3 transition-all",
                        item.number > step ? "cursor-default opacity-40" : "hover:opacity-80",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold transition-all sm:size-8",
                          active
                            ? "bg-[var(--deep-green)] text-[var(--paper)] ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--paper)]"
                            : complete
                            ? "bg-[var(--deep-green)] text-[var(--paper)]"
                            : "border hairline text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {complete ? <Check size={12} strokeWidth={2.5} /> : item.number}
                      </span>
                      <span
                        className={[
                          "hidden text-[10px] font-semibold uppercase tracking-[0.08em] md:block",
                          active ? "text-[var(--ink)]" : "text-[var(--muted)]",
                        ].join(" ")}
                      >
                        {item.label}
                      </span>
                    </button>
                    {idx < steps.length - 1 && (
                      <div className="mx-2 h-px flex-1 bg-[var(--deep-green)]/10 sm:mx-4" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CONTENT */}
          <div className="flex-1 px-4 py-6 sm:px-6 md:px-8 lg:px-10 lg:py-10 xl:px-12">
            <div className="w-full">
              {step === 1 && (
                <div className="animate-fade-in">
                  <StepHeading
                    index="01"
                    eyebrow="Contact Information"
                    title="Where should we send your confirmation?"
                    body="We'll send purchase receipts, dispatch notifications, and tracking updates to this email."
                  />

                  {!user && (
                    <div className="mt-6 rounded-lg border hairline bg-[var(--paper-2)] p-4 text-xs text-[var(--muted)]">
                      Have an account?{" "}
                      <Link
                        href="/account/login?next=/checkout"
                        className="font-medium text-[var(--ink)] underline underline-offset-4"
                      >
                        Sign in
                      </Link>{" "}
                      for saved addresses, or continue as guest.
                    </div>
                  )}

                  <div className="mt-8">
                    <Field label="Email Address">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@domain.com"
                        autoComplete="email"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="animate-fade-in">
                  <StepHeading
                    index="02"
                    eyebrow="Delivery Address"
                    title="Where should we deliver your pieces?"
                    body="Our white-glove logistics team will coordinate precise delivery for your selected items."
                  />

                  <div className="mt-8 grid gap-5 sm:grid-cols-2 sm:gap-6">
                    <Field label="Full Name">
                      <input
                        value={address.fullName}
                        onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                        autoComplete="name"
                        placeholder="Jane Doe"
                      />
                    </Field>
                    <Field label="Phone Number">
                      <input
                        value={address.phone}
                        onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                        autoComplete="tel"
                        placeholder="+254 700 000000"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Location Address">
                        <input
                          value={address.address1}
                          onChange={(e) => setAddress({ ...address, address1: e.target.value })}
                          autoComplete="address"
                          placeholder="Location Address"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Building, Apartment, suite, etc.">
                        <input
                          value={address.address2 || ""}
                          onChange={(e) => setAddress({ ...address, address2: e.target.value })}
                          autoComplete="address-line2"
                        />
                      </Field>
                    </div>
                    <Field label="City / Town">
                      <input
                        value={address.city}
                        onChange={(e) => setAddress({ ...address, city: e.target.value })}
                        autoComplete="address-level2"
                      />
                    </Field>
                    <Field label="Region / County">
                      <input
                        value={address.region}
                        onChange={(e) => setAddress({ ...address, region: e.target.value })}
                        autoComplete="address-level1"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Country">
                        <input
                          value={address.country}
                          onChange={(e) => setAddress({ ...address, country: e.target.value })}
                          autoComplete="country-name"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <form onSubmit={handleSubmit} className="animate-fade-in">
                  <StepHeading
                    index="03"
                    eyebrow="Payment Details"
                    title="Select your payment method."
                    body="All payment transfers are secured and encrypted."
                  />

                  <div className="mt-8 space-y-3">
                    {paymentMethods.map((method) => {
                      const Icon = method.icon;
                      const selected = paymentMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPaymentMethod(method.id)}
                          className={[
                            "flex w-full items-center justify-between rounded-lg border p-4 sm:p-5 text-left transition-all",
                            selected
                              ? "border-[var(--ink)] bg-[var(--deep-green)]/[0.03] shadow-sm"
                              : "border-[var(--ink)]/10 hover:border-[var(--ink)]/30 hover:bg-[var(--paper-2)]",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-3 sm:gap-4">
                            <span
                              className={[
                                "grid size-9 sm:size-10 place-items-center rounded-full transition-colors",
                                selected
                                  ? "bg-[var(--deep-green)] text-[var(--paper)]"
                                  : "bg-[var(--paper-2)] text-[var(--muted)]",
                              ].join(" ")}
                            >
                              <Icon size={15} strokeWidth={1.5} />
                            </span>
                            <div>
                              <p className="text-xs sm:text-sm font-semibold">{method.label}</p>
                              <p className="mt-0.5 text-[10px] sm:text-xs text-[var(--muted)]">{method.body}</p>
                            </div>
                          </div>
                          <span
                            className={[
                              "grid size-5 place-items-center rounded-full border-2 transition-all shrink-0",
                              selected
                                ? "border-[var(--ink)] bg-[var(--deep-green)]"
                                : "border-[var(--ink)]/20",
                            ].join(" ")}
                          >
                            {selected && <Check size={12} strokeWidth={3} className="text-[var(--paper)]" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-8 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <ShieldCheck
                        size={18}
                        strokeWidth={1.5}
                        className="mt-0.5 shrink-0 text-[var(--deep-green)]"
                      />
                      <div>
                        <p className="text-sm font-semibold">Pay securely with Paystack</p>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                          You will enter your payment details on Paystack&apos;s secure checkout.
                          Decor by Kasiwa does not collect or store your card number, CVV, expiry
                          date, mobile-money PIN, or bank credentials.
                        </p>
                        <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                          Selected method: {paymentMethod}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={initializingPayment}
                    className="focus-ring group mt-8 sm:mt-10 inline-flex min-h-12 sm:min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[var(--deep-green)] px-6 sm:px-8 text-xs font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {initializingPayment ? (
                      <LoaderCircle size={14} className="animate-spin text-soft-cream/80" />
                    ) : (
                      <LockKeyhole size={14} className="text-soft-cream/80" />
                    )}
                    <span>{initializingPayment ? "Opening Paystack" : "Continue to Paystack"}</span>
                    {!initializingPayment && (
                      <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
                    )}
                  </button>
                </form>
              )}

              {error && (
                <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-red-100">
                    <span className="text-xs font-bold">!</span>
                  </span>
                  {error}
                </div>
              )}

              {step < 3 && (
                <div className="mt-10 sm:mt-12 flex items-center justify-between  pt-6">
                  <button
                    type="button"
                    disabled={step === 1}
                    onClick={() => {
                      setError("");
                      setStep((current) => Math.max(1, current - 1));
                    }}
                    className="focus-ring inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowLeft size={13} /> Back
                  </button>
                  <button
                    type="button"
                    onClick={() => continueTo(step + 1)}
                    className="focus-ring group inline-flex min-h-11 sm:min-h-12 items-center gap-2 sm:gap-3 rounded-full bg-[var(--deep-green)] px-5 sm:px-8 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg"
                  >
                    <span className="hidden sm:inline">Continue to {steps[step].label}</span>
                    <span className="sm:hidden">Continue</span>
                    <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SUMMARY */}
        <div className="w-full border-t hairline bg-[var(--paper-2)] lg:w-[400px] xl:w-[480px] lg:border-l lg:border-t-0">
          <aside className="p-4 sm:p-6 md:p-8 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
            <div className="flex items-center justify-between border-b hairline pb-5 sm:pb-6">
              <div>
                <p className="kicker text-[var(--muted)]">Order Summary</p>
                <h2 className="mt-2 text-xl sm:text-2xl font-medium tracking-[-0.02em]">Your Selection</h2>
              </div>
              <span className="rounded-full bg-[var(--deep-green)]/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                {cart.length} {cart.length === 1 ? "Item" : "Items"}
              </span>
            </div>

            {/* ITEMS */}
            <div className="divide-y hairline">
              {lineItems.map(({ line, product }, index) =>
                product ? (
                  <article
                    key={`${line.productId}-${line.colour || "default"}`}
                    className="flex items-start justify-between gap-3 sm:gap-4 py-4 sm:py-5"
                  >
                    <div className="flex gap-3 sm:gap-4">
                      <div className="grid size-10 sm:size-12 shrink-0 place-items-center rounded-lg bg-[var(--deep-green)]/[0.03] text-xs font-medium text-[var(--muted)]">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold leading-snug">{product.name}</p>
                        <p className="mt-1 text-[10px] sm:text-xs text-[var(--muted)]">
                          Qty {line.quantity}
                          {line.colour ? ` · ${line.colour}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-xs sm:text-sm font-semibold">
                      {formatMoney(product.price * line.quantity)}
                    </span>
                  </article>
                ) : null
              )}
            </div>

            {/* TOTALS */}
            <div className="mt-5 sm:mt-6 space-y-3 sm:space-y-4 border-t hairline pt-5 sm:pt-6">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Subtotal</span>
                <span className="font-medium">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--muted)]">Delivery</span>
                <span className="text-xs text-[var(--muted)]">Calculated at next step</span>
              </div>
            </div>

            {/* TOTAL */}
            <div className="mt-5 sm:mt-6 flex items-baseline justify-between rounded-lg bg-[var(--deep-green)] px-5 sm:px-6 py-4 sm:py-5 text-[var(--paper)]">
              <span className="text-xs font-medium uppercase tracking-[0.08em] opacity-80">Total</span>
              <span className="text-2xl sm:text-3xl font-medium tracking-[-0.03em]">
                {formatMoney(subtotal)}
              </span>
            </div>

            {/* TRUST BADGES */}
            <div className="mt-5 sm:mt-6 grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border hairline bg-[var(--paper)] p-3">
                <Truck size={14} className="shrink-0 text-[var(--muted)]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
                  White-glove delivery
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border hairline bg-[var(--paper)] p-3">
                <Package size={14} className="shrink-0 text-[var(--muted)]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--muted)]">
                  Insured shipping
                </span>
              </div>
            </div>

            {/* FOOTNOTE */}
            <div className="mt-5 sm:mt-6 rounded-lg bg-[var(--deep-green)]/[0.03] p-4 text-xs leading-relaxed text-[var(--muted)]">
              <p className="font-semibold text-[var(--ink)] uppercase tracking-[0.06em] text-[10px]">
                Fulfilment Note
              </p>
              <p className="mt-2">
                Final delivery windows and freight quotes are confirmed after address verification.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function StepHeading({
  index,
  eyebrow,
  title,
  body,
}: {
  index: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-7 sm:size-8 place-items-center rounded-full bg-[var(--deep-green)] text-[10px] font-semibold text-[var(--paper)]">
          {index}
        </span>
        <p className="kicker text-[var(--muted)]">{eyebrow}</p>
      </div>
      <h1 className="mt-3 sm:mt-4 text-[clamp(1.8rem,3.5vw,3rem)] font-medium leading-[0.95] tracking-[-0.05em]">
        {title}
      </h1>
      <p className="mt-3 sm:mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-[var(--muted)]">
        {body}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {label}
      </span>
      <div className="group relative">
        <div className="[&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--ink)]/10 [&_input]:bg-[var(--paper)] [&_input]:px-3 sm:px-4 [&_input]:py-2.5 sm:py-3 [&_input]:text-sm [&_input]:text-[var(--ink)] [&_input]:outline-none [&_input]:transition-all [&_input]:placeholder:text-[var(--muted)]/50 [&_input]:focus:border-[var(--ink)] [&_input]:focus:ring-2 [&_input]:focus:ring-[var(--ink)]/10">
          {children}
        </div>
      </div>
    </label>
  );
}
