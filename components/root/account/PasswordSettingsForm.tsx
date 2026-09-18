"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";

import PasswordField from "./PasswordField";

export default function PasswordSettingsForm({ compact = false }: { compact?: boolean }) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/account/password", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { hasPassword?: boolean; message?: string };
        if (!response.ok) throw new Error(payload.message || "Unable to load password settings.");
        setHasPassword(payload.hasPassword === true);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load password settings."));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to update password.");
      setHasPassword(true);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={compact ? "rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5" : "rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-7"}>
      <div className="mb-5 flex items-start gap-3">
        <KeyRound size={17} className="mt-0.5 shrink-0 text-[var(--brand-green)]" />
        <div><p className="text-sm font-semibold">Password & security</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{hasPassword === false ? "Create a password so you can sign in with email as well as Google." : "Change your account password. Your email address cannot be changed here."}</p></div>
      </div>
      {hasPassword === null && !error ? <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin"/>Loading password settings…</div> : (
        <form onSubmit={submit} className="space-y-4">
          {hasPassword && <PasswordField label="Current password" name="currentPassword" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />}
          <PasswordField label={hasPassword ? "New password" : "Password"} name="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters, 1 number & 1 special character" />
          <PasswordField label="Confirm password" name="confirmPassword" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
          {message && <p role="status" className="text-xs text-green-700">{message}</p>}
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50 sm:w-auto">
            {saving ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>} {hasPassword ? "Change password" : "Create password"}
          </button>
        </form>
      )}
    </section>
  );
}
