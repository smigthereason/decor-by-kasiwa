"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, ShieldCheck, User } from "lucide-react";
import { useCommerce } from "@/components/root/commerce/CommerceProvider";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useCommerce();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !email.includes("@") || password.length < 4) {
      setError("Enter your name, a valid email, and a prototype password of at least four characters.");
      return;
    }
    login(email, name);
    router.push(searchParams.get("next") || "/account");
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl">
      {/* PROTOTYPE NOTE */}
      <div className="flex gap-4 rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
        <ShieldCheck size={18} strokeWidth={1.5} className="shrink-0 text-[var(--muted)]" />
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          This starter currently uses local browser state for the account journey. Replace it with production authentication before launch.
        </p>
      </div>

      {/* NAME FIELD */}
      <label className="mt-8 block">
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          Name
        </span>
        <div className="relative">
          <User
            size={16}
            strokeWidth={1.5}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="text"
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
            autoComplete="current-password"
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
        <span>Sign in</span>
        <ArrowRight size={14} className="text-soft-cream transition-transform group-hover:translate-x-1" />
      </button>

      {/* HELPER LINKS */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-6 text-xs !text-[var(--muted)]">
        <Link
          href="/account/forgot-password"
          className="underline underline-offset-4 transition-colors  hover:!text-[var(--ink)]"
        >
          Forgot password?
        </Link>
        <span>
          New here?{" "}
          <Link
            href="/account/register"
            className="font-medium hover:!text-[var(--ink)] underline underline-offset-4"
          >
            Create an account
          </Link>
        </span>
      </div>
    </form>
  );
}
