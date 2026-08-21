import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import LoginForm from "@/components/root/account/LoginForm";

export const metadata = { title: "Sign In" };

export default function LoginPage() {
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
          <LockKeyhole size={12} strokeWidth={1.5} />
          <span>Secure Sign In</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="grid flex-1 items-start lg:grid-cols-[0.8fr_1.2fr]">
        {/* LEFT: HEADER */}
        <div className="border-b hairline lg:border-b-0 lg:border-r">
          <div className="p-4 py-10 md:p-8 lg:sticky lg:top-[80px] lg:py-14 lg:px-12">
            <p className="kicker text-[var(--muted)]">Account</p>
            <h1 className="mt-4 text-[clamp(2.5rem,5vw,4rem)] font-medium leading-[0.9] tracking-[-0.06em]">
              Welcome Back
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">
              Sign in to access your account, track orders, and manage your saved items.
            </p>
          </div>
        </div>

        {/* RIGHT: FORM */}
        <div className="flex-1 p-4 py-10 md:p-8 lg:py-14 lg:px-12">
          <Suspense fallback={
            <div className="grid min-h-40 place-items-center">
              <div className="h-2 w-24 animate-pulse rounded-full bg-[var(--ink)]/10" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
