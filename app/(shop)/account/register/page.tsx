"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, ShieldCheck, User } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useCommerce();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.includes("@") || password.length < 4) {
      setError("Complete your name, email and a prototype password of at least four characters.");
      return;
    }
    register(name, email);
    router.push("/account");
  }

  return (
    <section className="flex min-h-[calc(100vh-140px)] w-full flex-col bg-[var(--paper)]">
      {/* HEADER BAR */}
      <div className="flex w-full items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link
          href="/account"
          className="focus-ring group inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"
        >
          <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" />
          Back to account
        </Link>
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
          <ShieldCheck size={12} strokeWidth={1.5} />
          <span>Create Account</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid flex-1 items-start lg:grid-cols-[0.8fr_1.2fr]">
        {/* LEFT: HEADER */}
        <div className="border-b hairline lg:border-b-0 lg:border-r">
          <div className="p-4 py-10 md:p-8 lg:sticky lg:top-[80px] lg:py-14 lg:px-12">
            <p className="kicker text-[var(--muted)]">Create Account</p>
            <h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              Make It Yours
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">
              The production account can later keep saved pieces, addresses, enquiries and order history together.
            </p>
          </div>
        </div>

        {/* RIGHT: FORM */}
        <div className="flex-1 p-4 py-10 md:p-8 lg:py-14 lg:px-12">
          <form onSubmit={submit} className="w-full max-w-xl">
            {/* PROTOTYPE NOTE */}
            <div className="flex gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
              <ShieldCheck size={18} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                Prototype only: no password is transmitted or stored. This simply demonstrates the registration journey using browser state.
              </p>
            </div>

            {/* FULL NAME FIELD */}
            <label className="mt-8 block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Full Name
              </span>
              <div className="relative">
                <User
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] py-3 pl-12 pr-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--muted)]/50 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10"
                  autoComplete="name"
                  placeholder="Jane Doe"
                />
              </div>
            </label>

            {/* EMAIL FIELD */}
            <label className="mt-6 block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Email
              </span>
              <div className="relative">
                <Mail
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] py-3 pl-12 pr-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--muted)]/50 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10"
                  autoComplete="email"
                  placeholder="name@domain.com"
                />
              </div>
            </label>

            {/* PASSWORD FIELD */}
            <label className="mt-6 block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
                Password
              </span>
              <div className="relative">
                <LockKeyhole
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ink)]/10 bg-[var(--paper)] py-3 pl-12 pr-4 text-sm text-[var(--ink)] outline-none transition-all placeholder:text-[var(--muted)]/50 focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--ink)]/10"
                  autoComplete="new-password"
                  placeholder="Enter your password"
                />
              </div>
            </label>

            {/* ERROR MESSAGE */}
            {error && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-red-100">
                  <span className="text-xs font-bold">!</span>
                </span>
                {error}
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              className="focus-ring group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all hover:shadow-lg hover:opacity-95"
            >
              <span>Create account</span>
              <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
            </button>

            {/* HELPER LINK */}
            <p className="mt-6 pt-6 text-xs text-[var(--muted)]">
              Already have an account?{" "}
              <Link
                href="/account/login"
                className="font-medium  underline underline-offset-4 transition-colors hover:!text-[var(--ink)]"
              >
                Sign in
              </Link>
              .
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
