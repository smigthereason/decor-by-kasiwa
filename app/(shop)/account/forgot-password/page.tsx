import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import type { Metadata } from "next";

import ForgotPasswordForm from "@/components/root/account/ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot Password" };

export default function ForgotPasswordPage() {
  return (
    <section className="min-h-[calc(100vh-140px)] bg-[var(--paper)]">
      <div className="flex items-center justify-between border-b hairline px-4 py-6 md:px-8"><Link href="/account/login" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em]"><ArrowLeft size={13}/>Back</Link><span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]"><KeyRound size={13}/>Password Recovery</span></div>
      <div className="grid lg:grid-cols-[0.8fr_1.2fr]"><div className="border-b hairline p-4 py-10 md:p-8 lg:border-b-0 lg:border-r lg:p-12"><p className="kicker text-[var(--muted)]">Security</p><h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">Reset your password</h1><p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">Enter the email attached to your account. We will send a secure reset link if the account is active.</p></div><div className="p-4 py-10 md:p-8 lg:p-12"><ForgotPasswordForm/></div></div>
    </section>
  );
}
