"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Check, LoaderCircle, Plus, Settings, Trash2, Truck, UserRound } from "lucide-react";

import { DEFAULT_DELIVERY_ZONES, type DeliveryZone } from "@/lib/shipping";

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

export default function StaffSettingsPage({ manageDelivery = false }: { manageDelivery?: boolean }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>(DEFAULT_DELIVERY_ZONES);
  const [deliveryLoading, setDeliveryLoading] = useState(manageDelivery);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!manageDelivery) return;
    void fetch("/api/backoffice/delivery-zones", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { deliveryZones?: DeliveryZone[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "Unable to load delivery pricing.");
        setDeliveryZones(payload.deliveryZones?.length ? payload.deliveryZones : DEFAULT_DELIVERY_ZONES);
      })
      .catch((cause) => setDeliveryMessage(cause instanceof Error ? cause.message : "Unable to load delivery pricing."))
      .finally(() => setDeliveryLoading(false));
  }, [manageDelivery]);

  async function saveProfile(event: FormEvent) {
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

  function updateDeliveryZone(index: number, patch: Partial<DeliveryZone>) {
    setDeliveryZones((current) => current.map((zone, zoneIndex) => zoneIndex === index ? { ...zone, ...patch } : zone));
  }

  function addDeliveryZone() {
    setDeliveryZones((current) => [
      ...current,
      {
        id: `delivery-zone-${Date.now()}-${current.length + 1}`,
        label: "",
        description: "",
        fee: 0,
        active: true,
      },
    ]);
  }

  function removeDeliveryZone(index: number) {
    setDeliveryZones((current) => current.filter((_, zoneIndex) => zoneIndex !== index));
  }

  async function saveDeliveryZones(event: FormEvent) {
    event.preventDefault();
    setDeliverySaving(true);
    setDeliveryMessage(null);
    try {
      const response = await fetch("/api/backoffice/delivery-zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryZones }),
      });
      const payload = await response.json() as { deliveryZones?: DeliveryZone[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to save delivery pricing.");
      if (payload.deliveryZones) setDeliveryZones(payload.deliveryZones);
      setDeliveryMessage("Delivery pricing saved. Active zones now appear at checkout.");
      router.refresh();
    } catch (cause) {
      setDeliveryMessage(cause instanceof Error ? cause.message : "Unable to save delivery pricing.");
    } finally {
      setDeliverySaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <header className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3"><Settings size={18} className="text-[var(--deep-green)]"/><div><p className="kicker text-[var(--muted)]">Settings</p><h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">Workspace settings</h1></div></div>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Manage your staff profile{manageDelivery ? " and the standard delivery rates used by e-commerce checkout" : ""}.</p>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-4 rounded-xl bg-[var(--paper-2)] p-4"><div className="grid size-11 place-items-center rounded-full bg-[var(--deep-green)] !text-soft-cream"><UserRound size={18}/></div><div><p className="text-sm font-semibold">Staff profile</p><p className="mt-1 text-xs text-[var(--muted)]">{session?.user?.email || profile.email}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--deep-green)]">{String(session?.user?.role || "STAFF").replaceAll("_", " ")}</p></div></div>
          {loading ? <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin"/>Loading settings…</div> : <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <SettingField label="Name" className="sm:col-span-2"><input value={profile.name} onChange={(e)=>setProfile({...profile,name:e.target.value})} required /></SettingField>
            <SettingField label="Email" className="sm:col-span-2"><input value={profile.email} disabled className="opacity-60"/><p className="mt-1 text-[10px] text-[var(--muted)]">Email is tied to your authenticated account and is read-only here.</p></SettingField>
            <SettingField label="Phone"><input value={profile.phone} onChange={(e)=>setProfile({...profile,phone:e.target.value})}/></SettingField>
            <SettingField label="Country"><input value={profile.country} onChange={(e)=>setProfile({...profile,country:e.target.value})}/></SettingField>
            <SettingField label="Address line 1" className="sm:col-span-2"><input value={profile.address1} onChange={(e)=>setProfile({...profile,address1:e.target.value})}/></SettingField>
            <SettingField label="Address line 2" className="sm:col-span-2"><input value={profile.address2} onChange={(e)=>setProfile({...profile,address2:e.target.value})}/></SettingField>
            <SettingField label="City / Town"><input value={profile.city} onChange={(e)=>setProfile({...profile,city:e.target.value})}/></SettingField>
            <SettingField label="County / Region"><input value={profile.region} onChange={(e)=>setProfile({...profile,region:e.target.value})}/></SettingField>
            <div className="sm:col-span-2 flex items-center justify-between gap-3 border-t hairline pt-5"><p role="status" className="text-xs text-[var(--muted)]">{message || "Changes are saved to your live staff profile."}</p><button type="submit" disabled={saving} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">{saving?<LoaderCircle size={14} className="animate-spin"/>:<Check size={14}/>}Save profile</button></div>
          </form>}
        </section>

        {manageDelivery && (
          <section className="rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-7">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--deep-green)] !text-soft-cream"><Truck size={18}/></div>
                <div>
                  <p className="text-sm font-semibold">E-commerce delivery pricing</p>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">Set standard delivery zones and prices. Customers select one at checkout and the configured fee is added automatically to the order total. You can add, edit, disable or delete zones.</p>
                </div>
              </div>
              <button type="button" onClick={addDeliveryZone} disabled={deliveryLoading} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border hairline px-4 text-[10px] font-semibold uppercase tracking-[0.08em]"><Plus size={13}/>Add delivery zone</button>
            </div>

            {deliveryLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin"/>Loading delivery pricing…</div>
            ) : (
              <form onSubmit={saveDeliveryZones} className="space-y-4">
                {deliveryZones.map((zone, index) => (
                  <div key={zone.id} className="rounded-xl border hairline bg-[var(--paper-2)] p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-[1.25fr_0.7fr_auto] sm:items-end">
                      <SettingField label="Delivery area / zone">
                        <input value={zone.label} onChange={(event) => updateDeliveryZone(index, { label: event.target.value })} placeholder="e.g. Within Nairobi" required />
                      </SettingField>
                      <SettingField label="Price (KES)">
                        <input type="number" min="0" step="1" value={zone.fee} onChange={(event) => updateDeliveryZone(index, { fee: Math.max(0, Number(event.target.value) || 0) })} required />
                      </SettingField>
                      <button type="button" onClick={() => removeDeliveryZone(index)} disabled={deliveryZones.length <= 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-red-700 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Delete ${zone.label || `delivery zone ${index + 1}`}`}><Trash2 size={13}/>Delete</button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                      <SettingField label="Checkout description">
                        <input value={zone.description || ""} onChange={(event) => updateDeliveryZone(index, { description: event.target.value })} placeholder="Optional customer-facing note" />
                      </SettingField>
                      <label className="flex min-h-11 items-center gap-3 rounded-lg border hairline bg-[var(--paper)] px-4 text-xs font-medium"><input type="checkbox" checked={zone.active} onChange={(event) => updateDeliveryZone(index, { active: event.target.checked })} className="size-4 accent-[var(--deep-green)]"/>Available at checkout</label>
                    </div>
                  </div>
                ))}

                <div className="flex flex-col gap-3 border-t hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p role="status" className="text-xs text-[var(--muted)]">{deliveryMessage || "Sample rate: Within Nairobi — KES 300. Edit it or add more zones such as CBD, South B, Kiambu, or upcountry."}</p>
                  <button type="submit" disabled={deliverySaving || deliveryZones.length === 0} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50">{deliverySaving?<LoaderCircle size={14} className="animate-spin"/>:<Check size={14}/>}Save delivery rates</button>
                </div>
              </form>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SettingField({ label, className="", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`block ${className}`}><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</span><div className="mt-2 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:transition [&_input]:focus:border-[var(--deep-green)]">{children}</div></label>;
}
