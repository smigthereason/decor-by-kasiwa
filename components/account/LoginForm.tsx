"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useCommerce();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!email.includes("@") || password.length < 4) {
      setError("Enter a valid email and a prototype password of at least four characters.");
      return;
    }
    login(email);
    router.push(searchParams.get("next") || "/account");
  }

  return (
    <form onSubmit={submit} className="max-w-xl">
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        This starter currently uses local browser state for the account journey. Replace it with production authentication before launch.
      </p>
      <label className="mt-8 grid gap-2">
        <span className="kicker text-[var(--muted)]">Email</span>
        <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" autoComplete="email" />
      </label>
      <label className="mt-6 grid gap-2">
        <span className="kicker text-[var(--muted)]">Password</span>
        <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" autoComplete="current-password" />
      </label>
      {error && <p className="mt-5 text-sm text-red-800">{error}</p>}
      <button type="submit" className="focus-ring mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--paper)]">Sign in <ArrowRight size={14}/></button>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-xs text-[var(--muted)]">
        <Link href="/account/forgot-password" className="underline underline-offset-4">Forgot password?</Link>
        <span>New here? <Link href="/account/register" className="text-[var(--ink)] underline underline-offset-4">Create an account</Link></span>
      </div>
    </form>
  );
}
