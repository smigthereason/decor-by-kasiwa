"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Check, LoaderCircle, Settings, UserRound } from "lucide-react";

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

const emptyProfile: Profile = { name: "", email: "", phone: "", address1: "", address2: "", city: "", region: "", country: "Kenya" };

export default function StaffSettingsPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/account/profile", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Profile & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Unable to load settings.");
        setProfile(payload);
      })
      .catch((cause) => setMessage(cause instanceof Error ? cause.message : "Unable to load settings."))
      .finally(() => setLoading(false));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to save settings.");
      await update({ name: profile.name });
      router.refresh();
      setMessage("Account settings saved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <header className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3"><Settings size={18} className="text-[var(--deep-green)]"/><div><p className="kicker text-[var(--muted)]">Settings</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">Workspace account settings</h1></div></div>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Update the contact details attached to your staff account. Access level remains controlled by the Admin role configuration.</p>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <section className="rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-4 rounded-xl bg-[var(--paper-2)] p-4"><div className="grid size-11 place-items-center rounded-full bg-[var(--deep-green)] !text-soft-cream"><UserRound size={18}/></div><div><p className="text-sm font-semibold">{session?.user?.name || profile.name || "Staff account"}</p><p className="mt-1 text-xs text-[var(--muted)]">{session?.user?.email || profile.email}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">{String(session?.user?.role || "STAFF").replaceAll("_", " ")}</p></div></div>
          {loading ? <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin"/>Loading settings…</div> : <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <SettingField label="Name" className="sm:col-span-2"><input value={profile.name} onChange={(e)=>setProfile({...profile,name:e.target.value})} required /></SettingField>
            <SettingField label="Email" className="sm:col-span-2"><input value={profile.email} disabled className="opacity-60"/><p className="mt-1 text-[10px] text-[var(--muted)]">Email is tied to your authenticated account and is read-only here.</p></SettingField>
            <SettingField label="Phone"><input value={profile.phone} onChange={(e)=>setProfile({...profile,phone:e.target.value})}/></SettingField>
            <SettingField label="Country"><input value={profile.country} onChange={(e)=>setProfile({...profile,country:e.target.value})}/></SettingField>
            <SettingField label="Address line 1" className="sm:col-span-2"><input value={profile.address1} onChange={(e)=>setProfile({...profile,address1:e.target.value})}/></SettingField>
            <SettingField label="Address line 2" className="sm:col-span-2"><input value={profile.address2} onChange={(e)=>setProfile({...profile,address2:e.target.value})}/></SettingField>
            <SettingField label="City / Town"><input value={profile.city} onChange={(e)=>setProfile({...profile,city:e.target.value})}/></SettingField>
            <SettingField label="County / Region"><input value={profile.region} onChange={(e)=>setProfile({...profile,region:e.target.value})}/></SettingField>
            <div className="sm:col-span-2 flex items-center justify-between gap-3 border-t hairline pt-5"><p role="status" className="text-xs text-[var(--muted)]">{message || "Changes are saved to your live staff profile."}</p><button type="submit" disabled={saving} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">{saving?<LoaderCircle size={14} className="animate-spin"/>:<Check size={14}/>}Save settings</button></div>
          </form>}
        </section>
      </main>
    </div>
  );
}

function SettingField({ label, className="", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`block ${className}`}><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span><div className="mt-2 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:transition [&_input]:focus:border-[var(--deep-green)]">{children}</div></label>;
}
