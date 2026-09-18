import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import type { Metadata } from "next";

import RegisterForm from "@/components/root/account/RegisterForm";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <section className="min-h-[calc(100vh-140px)] bg-[var(--paper)]">
      <div className="flex items-center justify-between border-b hairline px-4 py-6 md:px-8">
        <Link href="/account/login" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] transition-opacity hover:opacity-60"><ArrowLeft size={13}/>Back to sign in</Link>
        <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><UserPlus size={13}/>Create Account</span>
      </div>
      <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b hairline p-4 py-10 md:p-8 lg:border-b-0 lg:border-r lg:p-12"><p className="kicker text-[var(--muted)]">Account</p><h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">Create your account</h1><p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">Use your preferred email address and a password. You will be signed in automatically after registration.</p></div>
        <div className="p-4 py-10 md:p-8 lg:p-12"><RegisterForm/></div>
      </div>
    </section>
  );
}
