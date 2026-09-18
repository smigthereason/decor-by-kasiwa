"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { type FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

import PasswordField from "./PasswordField";

export default function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState<"credentials" | "google" | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading("credentials");
    setMessage("");

    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to create account.");

      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) throw new Error("Account created, but automatic sign in failed. Please sign in.");

      router.replace("/account/route");
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create account.");
      setLoading(null);
    }
  }

  async function registerWithGoogle() {
    if (loading) return;
    setLoading("google");
    setMessage("");
    try {
      await signIn("google", { callbackUrl: "/account/route" });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to continue with Google.");
      setLoading(null);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className="mt-2 min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] px-4 text-sm outline-none focus:border-[var(--brand-green)]" />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] px-4 text-sm outline-none focus:border-[var(--brand-green)]" />
        </label>
        <PasswordField label="Password" name="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters, 1 number & 1 special character" />
        <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />

        {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{message}</p>}

        <button type="submit" disabled={Boolean(loading)} className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-6 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all duration-200 hover:bg-[var(--brand-green)] hover:shadow-md disabled:pointer-events-none disabled:opacity-60">
          {loading === "credentials" ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          {loading === "credentials" ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="my-7 flex items-center gap-4"><span className="h-px flex-1 bg-black/10"/><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">or</span><span className="h-px flex-1 bg-black/10"/></div>

      <button type="button" onClick={registerWithGoogle} disabled={Boolean(loading)} className="focus-ring group flex min-h-[54px] w-full items-center justify-center gap-4 rounded-full border hairline bg-[var(--paper)] px-6 text-[12px] font-semibold text-[var(--ink)] transition-all duration-200 hover:border-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:!text-soft-cream hover:shadow-md disabled:pointer-events-none disabled:opacity-60">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[15px] font-bold text-[#4285F4]" aria-hidden="true">G</span>
        <span>{loading === "google" ? "Connecting to Google…" : "Create account with Google"}</span>
        {loading !== "google" && <ArrowRight size={15} className="transition-transform group-hover:translate-x-1"/>}
      </button>

      <p className="mt-7 text-center text-xs text-[var(--muted)]">Already have an account? <Link href="/account/login" className="font-semibold text-[var(--brand-green)] underline underline-offset-4 transition-opacity hover:opacity-60">Sign in</Link></p>
    </div>
  );
}
