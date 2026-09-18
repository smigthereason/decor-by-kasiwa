"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";

import PasswordField from "./PasswordField";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"credentials" | "google" | null>(null);
  const [message, setMessage] = useState("");

  const requestedNext = searchParams.get("next");
  const roleRouterUrl = requestedNext
    ? `/account/route?next=${encodeURIComponent(requestedNext)}`
    : "/account/route";

  useEffect(() => {
    if (status === "authenticated") router.replace(roleRouterUrl);
  }, [status, router, roleRouterUrl]);

  async function loginWithPassword(event: FormEvent) {
    event.preventDefault();
    setLoading("credentials");
    setMessage("");
    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) throw new Error("Email or password is incorrect, or the account is unavailable.");
      router.replace(roleRouterUrl);
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to sign in.");
      setLoading(null);
    }
  }

  async function loginWithGoogle() {
    setLoading("google");
    setMessage("");
    try {
      await signIn("google", { callbackUrl: roleRouterUrl });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Google sign in failed.");
      setLoading(null);
    }
  }

  if (status === "loading" || status === "authenticated") {
    return <div className="grid min-h-48 place-items-center"><div className="text-center"><div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-[var(--deep-green)]/10"/><p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Checking account…</p></div></div>;
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={loginWithPassword} className="space-y-5">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] px-4 text-sm outline-none focus:border-[var(--deep-green)]" />
        </label>
        <PasswordField label="Password" name="password" value={password} onChange={setPassword} autoComplete="current-password" />

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <Link href="/account/forgot-password" className="font-semibold text-[var(--brand-green)] underline underline-offset-4 transition-opacity hover:opacity-60">Forgot password?</Link>
          <Link href="/account/register" className="font-semibold text-[var(--brand-green)] underline underline-offset-4 transition-opacity hover:opacity-60">Create account</Link>
        </div>

        {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{message}</p>}

        <button type="submit" disabled={Boolean(loading)} className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all duration-200 hover:bg-[var(--brand-green)] hover:shadow-md disabled:pointer-events-none disabled:opacity-60">
          {loading === "credentials" ? <LoaderCircle size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
          {loading === "credentials" ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="my-7 flex items-center gap-4"><span className="h-px flex-1 bg-black/10"/><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">or</span><span className="h-px flex-1 bg-black/10"/></div>

      <button type="button" onClick={loginWithGoogle} disabled={Boolean(loading)} className="focus-ring group flex min-h-[54px] w-full items-center justify-center gap-4 rounded-full border hairline bg-[var(--paper)] px-6 text-[12px] font-semibold text-[var(--ink)] transition-all duration-200 hover:border-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:!text-soft-cream hover:shadow-md disabled:pointer-events-none disabled:opacity-60">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[15px] font-bold text-[#4285F4]" aria-hidden="true">G</span>
        <span>{loading === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
        {loading !== "google" && <ArrowRight size={15} className="transition-transform group-hover:translate-x-1"/>}
      </button>

      <p className="mt-7 text-xs leading-5 text-[var(--muted)]">Customers and staff can use email and password. Google sign in remains available for accounts already connected to Google.</p>
    </div>
  );
}
