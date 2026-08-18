"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
import { formatMoney, getProductById } from "@/lib/products";
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

export default function CheckoutPage() {
  const router = useRouter();
  const { hydrated, cart, subtotal, user, createOrder } = useCommerce();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<DemoAddress>(emptyAddress);
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [mobileNumber, setMobileNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setEmail((current) => current || user.email);
      setAddress((current) => ({
        ...current,
        fullName: current.fullName || user.name,
      }));
    }
  }, [user]);

  const lineItems = useMemo(
    () =>
      cart
        .map((line) => ({ line, product: getProductById(line.productId) }))
        .filter((item) => Boolean(item.product)),
    [cart]
  );

  if (!hydrated) {
    return <div className="grid min-h-[60vh] place-items-center text-xs uppercase tracking-[0.08em]">Loading checkout…</div>;
  }

  if (cart.length === 0) {
    return (
      <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-20 md:px-8 md:py-28">
        <p className="kicker text-[var(--muted)]">Checkout</p>
        <h1 className="mt-5 text-[clamp(3.6rem,9vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">NOTHING TO CHECK OUT.</h1>
        <Link href="/shop" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Return to shop <ArrowRight size={13}/></Link>
      </section>
    );
  }

  function validateStep(nextStep: number) {
    setError("");
    if (step === 1 && nextStep > 1) {
      if (!email.trim() || !email.includes("@")) {
        setError("Enter a valid email address to continue.");
        return false;
      }
    }
    if (step === 2 && nextStep > 2) {
      const required = [
        address.fullName,
        address.phone,
        address.address1,
        address.city,
        address.region,
        address.country,
      ];
      if (required.some((value) => !value.trim())) {
        setError("Complete the required delivery details to continue.");
        return false;
      }
    }
    return true;
  }

  function continueTo(nextStep: number) {
    if (validateStep(nextStep)) setStep(nextStep);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (paymentMethod === "Card") {
      if (![cardName, cardNumber, expiry, cvv].every((value) => value.trim())) {
        setError("Complete the prototype card fields before placing the order.");
        return;
      }
    }

    if (paymentMethod === "Mobile money" && !mobileNumber.trim()) {
      setError("Enter the mobile number for the prototype payment step.");
      return;
    }

    const order = createOrder({ email, address, paymentMethod });
    router.push(`/checkout/success?order=${encodeURIComponent(order.id)}`);
  }

  return (
    <section className="w-full border-b hairline bg-[var(--paper)]">
      <div className="border-b hairline px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/cart" className="focus-ring inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"><ArrowLeft size={13}/> Back to bag</Link>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><LockKeyhole size={13}/> Prototype checkout — no payment will be charged</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
        <div className="border-b hairline px-4 py-10 md:px-8 lg:border-b-0 lg:border-r lg:py-14">
          <div className="mb-10 flex gap-2">
            {[1, 2, 3].map((number) => (
              <button
                type="button"
                key={number}
                onClick={() => number < step && setStep(number)}
                className={`focus-ring flex h-9 flex-1 items-center justify-center border text-[10px] uppercase tracking-[0.08em] ${
                  step === number
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : number < step
                      ? "border-[var(--ink)]"
                      : "hairline text-[var(--muted)]"
                }`}
              >
                {number < step ? <Check size={12} className="mr-2"/> : null}
                {number === 1 ? "Contact" : number === 2 ? "Delivery" : "Payment"}
              </button>
            ))}
          </div>

          {step === 1 && (
            <div className="max-w-2xl">
              <p className="kicker text-[var(--muted)]">01 — Contact</p>
              <h1 className="mt-4 text-[clamp(2.8rem,6vw,6rem)] font-medium leading-[0.92] tracking-[-0.065em]">WHERE SHOULD WE SEND YOUR ORDER DETAILS?</h1>
              {!user && (
                <p className="mt-6 text-sm text-[var(--muted)]">Already have an account? <Link href="/account/login?next=/checkout" className="text-[var(--ink)] underline underline-offset-4">Sign in</Link> for a faster checkout, or continue as a guest.</p>
              )}
              <Field label="Email address">
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="max-w-3xl">
              <p className="kicker text-[var(--muted)]">02 — Delivery</p>
              <h1 className="mt-4 text-[clamp(2.8rem,6vw,6rem)] font-medium leading-[0.92] tracking-[-0.065em]">WHERE IS THE SPACE?</h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--muted)]">Small décor and large furniture can require different fulfilment arrangements. This prototype collects the address now; live delivery rates and scheduling should be connected after the client confirms logistics rules.</p>
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <Field label="Full name"><input value={address.fullName} onChange={(e) => setAddress({...address, fullName:e.target.value})} autoComplete="name" /></Field>
                <Field label="Phone"><input value={address.phone} onChange={(e) => setAddress({...address, phone:e.target.value})} autoComplete="tel" /></Field>
                <div className="sm:col-span-2"><Field label="Address line 1"><input value={address.address1} onChange={(e) => setAddress({...address, address1:e.target.value})} autoComplete="address-line1" /></Field></div>
                <div className="sm:col-span-2"><Field label="Address line 2 (optional)"><input value={address.address2 || ""} onChange={(e) => setAddress({...address, address2:e.target.value})} autoComplete="address-line2" /></Field></div>
                <Field label="City / town"><input value={address.city} onChange={(e) => setAddress({...address, city:e.target.value})} autoComplete="address-level2" /></Field>
                <Field label="Region / county"><input value={address.region} onChange={(e) => setAddress({...address, region:e.target.value})} autoComplete="address-level1" /></Field>
                <div className="sm:col-span-2"><Field label="Country"><input value={address.country} onChange={(e) => setAddress({...address, country:e.target.value})} autoComplete="country-name" /></Field></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="max-w-3xl">
              <p className="kicker text-[var(--muted)]">03 — Payment & review</p>
              <h1 className="mt-4 text-[clamp(2.8rem,6vw,6rem)] font-medium leading-[0.92] tracking-[-0.065em]">REVIEW. THEN PLACE THE ORDER.</h1>

              <div className="mt-8 grid gap-2 sm:grid-cols-3">
                {["Card", "Mobile money", "Bank transfer"].map((method) => (
                  <button
                    type="button"
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`focus-ring min-h-14 border px-4 text-left text-[10px] uppercase tracking-[0.08em] ${paymentMethod === method ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "hairline"}`}
                  >
                    {method}
                  </button>
                ))}
              </div>

              {paymentMethod === "Card" && (
                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Name on card"><input value={cardName} onChange={(e)=>setCardName(e.target.value)} /></Field></div>
                  <div className="sm:col-span-2"><Field label="Card number"><input inputMode="numeric" value={cardNumber} onChange={(e)=>setCardNumber(e.target.value)} placeholder="Prototype field" /></Field></div>
                  <Field label="Expiry"><input value={expiry} onChange={(e)=>setExpiry(e.target.value)} placeholder="MM/YY" /></Field>
                  <Field label="CVV"><input value={cvv} onChange={(e)=>setCvv(e.target.value)} inputMode="numeric" placeholder="•••" /></Field>
                </div>
              )}

              {paymentMethod === "Mobile money" && (
                <div className="mt-7"><Field label="Mobile number"><input value={mobileNumber} onChange={(e)=>setMobileNumber(e.target.value)} inputMode="tel" placeholder="Prototype mobile payment number" /></Field></div>
              )}

              {paymentMethod === "Bank transfer" && (
                <div className="mt-7 border hairline p-5 text-sm leading-relaxed text-[var(--muted)]">The live implementation should display client-approved bank instructions only after an order is created. No bank details are included in this prototype.</div>
              )}

              <div className="mt-8 border-y hairline py-5 text-xs leading-relaxed text-[var(--muted)]">
                By placing this prototype order you are testing the UX only. No live payment gateway is connected and no funds will be charged.
              </div>

              <button type="submit" className="focus-ring mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--paper)]">Place prototype order <ArrowRight size={14}/></button>
            </form>
          )}

          {error && <p className="mt-6 border border-red-700/20 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

          {step < 3 && (
            <div className="mt-10 flex justify-between border-t hairline pt-5">
              <button type="button" disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} className="focus-ring inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] disabled:opacity-25"><ArrowLeft size={13}/> Back</button>
              <button type="button" onClick={() => continueTo(step + 1)} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--paper)]">Continue <ArrowRight size={13}/></button>
            </div>
          )}
        </div>

        <aside className="self-start bg-[var(--canvas)] p-4 md:p-8 lg:sticky lg:top-[101px] lg:min-h-[calc(100vh-101px)]">
          <p className="kicker text-[var(--muted)]">Your order</p>
          <div className="mt-5 divide-y hairline border-y hairline">
            {lineItems.map(({ line, product }) => product && (
              <div key={`${line.productId}-${line.colour || "default"}`} className="grid grid-cols-[1fr_auto] gap-4 py-4 text-xs">
                <div><p className="font-medium">{line.quantity} × {product.name}</p>{line.colour && <p className="mt-1 text-[var(--muted)]">{line.colour}</p>}</div>
                <span>{formatMoney(product.price * line.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3 border-b hairline py-5 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            <div className="flex justify-between gap-4 text-[var(--muted)]"><span>Delivery</span><span className="text-right">To be calculated from live fulfilment rules</span></div>
          </div>
          <div className="flex justify-between py-5 text-lg font-medium"><span>Total before delivery</span><span>{formatMoney(subtotal)}</span></div>
        </aside>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-6 grid gap-2">
      <span className="kicker text-[var(--muted)]">{label}</span>
      <div className="[&_input]:w-full [&_input]:border-b [&_input]:border-black/20 [&_input]:bg-transparent [&_input]:py-3 [&_input]:outline-none [&_input]:transition-colors focus-within:[&_input]:border-black">
        {children}
      </div>
    </label>
  );
}
