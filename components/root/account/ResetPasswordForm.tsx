"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

import PasswordField from "./PasswordField";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password, confirmPassword }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to reset password.");
      setMessage("Password updated. Redirecting to sign in…");
      window.setTimeout(() => router.replace(`/account/login?email=${encodeURIComponent(email)}`), 900);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  if (!email || !token) {
    return <div className="w-full max-w-xl"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">This reset link is incomplete. Request a new password reset link.</p><Link href="/account/forgot-password" className="mt-5 inline-block text-xs font-semibold text-[var(--brand-green)] underline">Request another link</Link></div>;
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl space-y-5">
      <p className="rounded-xl border hairline bg-[var(--paper-2)] p-4 text-xs text-[var(--muted)]">Resetting password for <strong className="text-[var(--ink)]">{email}</strong></p>
      <PasswordField label="New password" name="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters, 1 number & 1 special character" />
      <PasswordField label="Confirm new password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
      {message && <p role="status" className="rounded-xl border hairline bg-[var(--paper-2)] p-4 text-xs">{message}</p>}
      <button type="submit" disabled={loading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-6 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-60">
        {loading ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
        {loading ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
