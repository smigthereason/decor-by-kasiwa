import { Suspense } from "react";
import LoginForm from "@/components/account/LoginForm";

export const metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-16 md:px-8 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="kicker text-[var(--muted)]">Account</p>
          <h1 className="mt-5 text-[clamp(3.6rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">WELCOME BACK.</h1>
        </div>
        <Suspense fallback={<div>Loading…</div>}><LoginForm/></Suspense>
      </div>
    </section>
  );
}
