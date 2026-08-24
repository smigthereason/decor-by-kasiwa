"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.includes("@")) setSent(true);
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* HEADER BAR */}
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/account/login"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
          Back to sign in
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <LockKeyhole size={12} strokeWidth={1.5} />
          <span>Password Recovery</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 md:px-8 lg:py-14">
        <div className="w-full max-w-xl">
          <div className=" pb-8">
            <p className="kicker text-[var(--muted)]">Password Recovery</p>
            <h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              Reset Access
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
              Enter your email address and we'll help you regain access to your account.
            </p>
          </div>

          <div className="pt-8">
            {sent ? (
              <div className="rounded-lg border hairline bg-[var(--paper-2)] p-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--deep-green)] text-[var(--paper)]">
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                  <p className="text-sm font-medium">Prototype recovery complete</p>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                  No email was sent. Connect this page to the selected authentication provider before production.
                </p>
                <Link
                  href="/account/login"
                  className="focus-ring group mt-6 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink)]"
                >
                  <span>Return to sign in</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                    Email Address
                  </span>
                  <div className="relative">
                    <Mail
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
                <button
                  type="submit"
                  className="focus-ring group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg hover:opacity-95"
                >
                  <span>Continue</span>
                  <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
