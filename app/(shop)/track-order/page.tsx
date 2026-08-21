"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Package, Search } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";
import { formatMoney } from "@/lib/products";
import type { DemoOrder } from "@/types/commerce";

export default function TrackOrderPage() {
  const { orders } = useCommerce();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<DemoOrder | null | undefined>(undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    const match = orders.find(
      (order) =>
        order.id.toLowerCase() === reference.trim().toLowerCase() &&
        order.email.toLowerCase() === email.trim().toLowerCase()
    );
    setResult(match || null);
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* HEADER BAR */}
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/shop"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
          Continue shopping
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <Package size={12} strokeWidth={1.5} />
          <span>Order Tracking</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid flex-1 items-start lg:grid-cols-[0.8fr_1.2fr]">
        {/* LEFT: HEADER */}
        <div className="border-b hairline lg:border-b-0 lg:border-r">
          <div className="p-4 py-10 md:p-8 lg:sticky lg:top-[80px] lg:py-14 lg:px-12">
            <p className="kicker text-[var(--muted)]">Orders</p>
            <h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              Track An Order
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">
              This prototype can look up orders created in this browser. Production tracking should be connected to the real order and fulfilment system.
            </p>
          </div>
        </div>

        {/* RIGHT: FORM */}
        <div className="flex-1 p-4 py-10 md:p-8 lg:py-14 lg:px-12">
          <form onSubmit={submit} className="w-full max-w-xl">
            {/* REFERENCE FIELD */}
            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Order Reference
              </span>
              <div className="relative">
                <Search
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  required
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] py-3 pl-12 pr-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--muted)]/50 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10"
                  placeholder="KSI-..."
                />
              </div>
            </label>

            {/* EMAIL FIELD */}
            <label className="mt-6 block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Order Email
              </span>
              <div className="relative">
                <LockKeyhole
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] py-3 pl-12 pr-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--muted)]/50 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10"
                  placeholder="name@domain.com"
                />
              </div>
            </label>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              className="focus-ring group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white transition-all hover:shadow-lg hover:opacity-95"
            >
              <span>Find order</span>
              <ArrowRight size={14} className="text-white transition-transform group-hover:translate-x-1" />
            </button>

            {/* ERROR MESSAGE */}
            {result === null && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-red-100">
                  <span className="text-xs font-bold">!</span>
                </span>
                No prototype order matched those details.
              </div>
            )}

            {/* SUCCESS RESULT */}
            {result && (
              <div className="mt-8 rounded-lg border hairline bg-[var(--paper-2)] p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                    <Check size={16} strokeWidth={2.5} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{result.status}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {result.id}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t hairline pt-4">
                  <span className="text-sm text-[var(--muted)]">Order Total</span>
                  <span className="text-lg font-semibold">
                    {formatMoney(result.subtotal)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--muted)]">Order Date</span>
                  <span className="text-sm">
                    {new Date(result.createdAt).toLocaleDateString("en-KE", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--muted)]">Payment Method</span>
                  <span className="text-sm">{result.paymentMethod}</span>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
