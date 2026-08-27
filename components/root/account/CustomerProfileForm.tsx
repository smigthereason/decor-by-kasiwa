"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, MapPin, Phone } from "lucide-react";

type Profile = {
  name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  region: string;
  country: string;
};

const emptyProfile: Profile = {
  name: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  country: "Kenya",
};

export default function CustomerProfileForm() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/account/profile", { cache: "no-store" });
        if (!response.ok) throw new Error("Profile could not be loaded.");
        const data = (await response.json()) as Profile;
        if (active) setProfile({ ...emptyProfile, ...data });
      } catch (cause) {
        console.error(cause);
        if (active) setError("Contact details could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  function update(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          phone: profile.phone,
          address1: profile.address1,
          address2: profile.address2,
          city: profile.city,
          region: profile.region,
          country: profile.country,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.message === "string" ? payload.message : "Profile update failed.");
      }
      setMessage("Contact details saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile update failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border hairline bg-[var(--paper-2)] p-5">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <LoaderCircle size={14} className="animate-spin" /> Loading contact details…
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border hairline bg-[var(--paper-2)] p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <Phone size={16} className="shrink-0 text-[var(--muted)]" />
        <div>
          <p className="text-sm font-semibold">Contact & delivery details</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">Used to contact you about purchases and pre-fill checkout.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <input value={profile.name} onChange={(e) => update("name", e.target.value)} placeholder="Full name" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
        <input value={profile.email} disabled className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--muted)] outline-none disabled:opacity-70" />
        <input value={profile.phone} onChange={(e) => update("phone", e.target.value)} placeholder="Phone number e.g. +254 7XX XXX XXX" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
        <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><MapPin size={12} /> Default delivery address</div>
        <input value={profile.address1} onChange={(e) => update("address1", e.target.value)} placeholder="Address line 1" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
        <input value={profile.address2} onChange={(e) => update("address2", e.target.value)} placeholder="Address line 2 (optional)" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
        <div className="grid grid-cols-2 gap-3">
          <input value={profile.city} onChange={(e) => update("city", e.target.value)} placeholder="City / Town" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
          <input value={profile.region} onChange={(e) => update("region", e.target.value)} placeholder="County / Region" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
        </div>
        <input value={profile.country} onChange={(e) => update("country", e.target.value)} placeholder="Country" className="rounded-lg border hairline bg-[var(--paper)] px-3 py-2.5 text-sm outline-none" />
      </div>

      {(message || error) && (
        <p className={`mt-3 text-xs ${error ? "text-red-700" : "text-[var(--deep-green)]"}`}>{message || error}</p>
      )}

      <button type="button" onClick={save} disabled={saving} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] text-soft-cream disabled:opacity-50">
        {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />}
        {saving ? "Saving" : "Save details"}
      </button>
    </div>
  );
}
