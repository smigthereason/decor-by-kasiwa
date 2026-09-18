import { Suspense } from "react";
import type { Metadata } from "next";

import ResetPasswordForm from "@/components/root/account/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset Password" };

export default function ResetPasswordPage() {
  return <section className="min-h-[calc(100vh-140px)] bg-[var(--paper)] px-4 py-14 md:px-8"><div className="mx-auto max-w-xl"><p className="kicker text-[var(--muted)]">Security</p><h1 className="mt-4 text-4xl font-medium tracking-[-0.05em]">Choose a new password</h1><div className="mt-8"><Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading reset form…</p>}><ResetPasswordForm/></Suspense></div></div></section>;
}
