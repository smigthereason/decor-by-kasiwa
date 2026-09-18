"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to send reset email.");
      setMessage(payload.message || "Check your email for a password reset link.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl space-y-5">
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Account email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] px-4 text-sm outline-none focus:border-[var(--brand-green)]" />
      </label>
      {message && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs text-green-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{error}</p>}
      <button type="submit" disabled={loading} className="focus-ring inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-6 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition-all duration-200 hover:bg-[var(--brand-green)] hover:shadow-md disabled:pointer-events-none disabled:opacity-60">
        {loading ? <LoaderCircle size={15} className="animate-spin" /> : <Mail size={15} />}
        {loading ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-xs text-[var(--muted)]"><Link href="/account/login" className="font-semibold text-[var(--brand-green)] underline underline-offset-4 transition-opacity hover:opacity-60">Back to sign in</Link></p>
    </form>
  );
}
