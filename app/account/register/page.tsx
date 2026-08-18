"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";

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
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-16 md:px-8 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="kicker text-[var(--muted)]">Create account</p>
          <h1 className="mt-5 text-[clamp(3.6rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">MAKE IT YOURS.</h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">The production account can later keep saved pieces, addresses, enquiries and order history together.</p>
        </div>
        <form onSubmit={submit} className="max-w-xl">
          <p className="text-sm leading-relaxed text-[var(--muted)]">Prototype only: no password is transmitted or stored. This simply demonstrates the registration journey using browser state.</p>
          <label className="mt-8 grid gap-2"><span className="kicker text-[var(--muted)]">Full name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" autoComplete="name" /></label>
          <label className="mt-6 grid gap-2"><span className="kicker text-[var(--muted)]">Email</span><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" autoComplete="email" /></label>
          <label className="mt-6 grid gap-2"><span className="kicker text-[var(--muted)]">Password</span><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" autoComplete="new-password" /></label>
          {error && <p className="mt-5 text-sm text-red-800">{error}</p>}
          <button type="submit" className="focus-ring mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Create account <ArrowRight size={14}/></button>
          <p className="mt-5 text-xs text-[var(--muted)]">Already have an account? <Link href="/account/login" className="text-[var(--ink)] underline underline-offset-4">Sign in</Link>.</p>
        </form>
      </div>
    </section>
  );
}
