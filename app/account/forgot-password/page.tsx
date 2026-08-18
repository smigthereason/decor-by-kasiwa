"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (email.includes("@")) setSent(true);
  }

  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl">
        <Link href="/account/login" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"><ArrowLeft size={13}/> Back to sign in</Link>
        <p className="kicker mt-12 text-[var(--muted)]">Password recovery</p>
        <h1 className="mt-5 text-[clamp(3.4rem,8vw,7rem)] font-medium leading-[0.86] tracking-[-0.075em]">RESET ACCESS.</h1>
        {sent ? (
          <div className="mt-8 border-t hairline pt-6"><p className="inline-flex items-center gap-2 text-sm"><Check size={15}/> Prototype recovery complete.</p><p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">No email was sent. Connect this page to the selected authentication provider before production.</p></div>
        ) : (
          <form onSubmit={submit} className="mt-8"><label className="grid gap-2"><span className="kicker text-[var(--muted)]">Email</span><input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" /></label><button className="mt-6 rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Continue</button></form>
        )}
      </div>
    </section>
  );
}
