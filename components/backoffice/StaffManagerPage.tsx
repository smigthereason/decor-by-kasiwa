"use client";

import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, Plus, Save, UserCog } from "lucide-react";

const roles = [
  ["STORE_STAFF", "Sales Staff"], ["PRODUCTION_STAFF", "Production"], ["PACKAGING_STAFF", "Packaging"],
  ["DELIVERY_STAFF", "Delivery"], ["STORE", "Store Manager"], ["ADMIN", "Admin / Owner"],
] as const;
const permissions = [
  ["POS_SALES", "POS Sales"], ["WHATSAPP_SALES", "WhatsApp Sales"], ["TIKTOK_SALES", "TikTok Sales"],
  ["GROUND_SALES", "Ground Sales"], ["PRODUCTION", "Production"], ["PRINTING", "Printing"],
  ["PACKAGING", "Packaging"], ["DELIVERY", "Delivery"],
] as const;
type Role = typeof roles[number][0];
type Permission = typeof permissions[number][0];
type Staff = { _id: string; name: string; email: string; role: Role; permissions?: Permission[]; status: "ACTIVE" | "SUSPENDED"; lastLoginAt?: string };
type Editor = { name: string; email: string; role: Role; permissions: Permission[]; status: "ACTIVE" | "SUSPENDED" };
const blank: Editor = { name: "", email: "", role: "STORE_STAFF", permissions: [], status: "ACTIVE" };

export default function StaffManagerPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [editor, setEditor] = useState<Editor>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/backoffice/staff", { cache: "no-store" });
    const payload = await response.json() as { staff?: Staff[]; message?: string };
    if (!response.ok) throw new Error(payload.message || "Unable to load staff.");
    setStaff(payload.staff || []);
  }

  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load staff.")).finally(() => setLoading(false)); }, []);

  function choose(item: Staff | null) {
    setSelected(item);
    setEditor(item ? { name: item.name, email: item.email, role: item.role, permissions: item.permissions || [], status: item.status } : blank);
    setMessage("");
  }

  function toggle(permission: Permission) {
    setEditor((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(selected ? `/api/backoffice/staff/${selected._id}` : "/api/backoffice/staff", {
        method: selected ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to save staff member.");
      await load();
      setMessage(selected ? "Staff member updated." : "Staff member created.");
      if (!selected) choose(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save staff member.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid w-full max-w-[1500px] items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-5 xl:flex xl:max-h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="kicker text-[var(--muted)]">People</p><h1 className="mt-2 text-2xl font-semibold">Staff</h1></div>
            <button onClick={() => choose(null)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--deep-green)] px-4 py-2 text-xs font-semibold text-white"><Plus size={14}/>Add staff</button>
          </div>
          <div className="mt-5 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
            {loading ? <LoaderCircle className="animate-spin" /> : staff.map((item) => (
              <button key={item._id} onClick={() => choose(item)} className={`w-full min-w-0 rounded-xl border p-3 text-left ${selected?._id === item._id ? "border-[var(--deep-green)] bg-[var(--brand-green)]/5" : "hairline bg-[var(--paper)]"}`}>
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="mt-1 break-all text-[10px] leading-4 text-[var(--muted)]">{item.email}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">{roles.find(([value]) => value === item.role)?.[1]} · {item.status}</p>
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={save} className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-6 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:overscroll-contain">
          <div className="flex items-center gap-2"><UserCog size={18}/><h2 className="text-base font-semibold sm:text-lg">{selected ? "Edit staff member" : "Pre-register staff member"}</h2></div>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">Use the employee&apos;s @decorbykasiwa.co.ke address. OTP authentication will link to these records in the next revision.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Name<input required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Work email<input required type="email" value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Primary role<select value={editor.role} onChange={(event) => setEditor({ ...editor, role: event.target.value as Role })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Status<select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as Editor["status"] })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
          </div>
          <div className="mt-6 rounded-xl border hairline bg-[var(--paper)] p-4">
            <p className="text-xs font-semibold">Additional responsibilities</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Use these when one employee works across more than one operational area.</p>
            <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
              {permissions.map(([value, label]) => <label key={value} className="inline-flex min-h-10 items-center gap-2 rounded-lg border hairline bg-white px-3 text-xs"><input type="checkbox" checked={editor.permissions.includes(value)} onChange={() => toggle(value)}/><span>{label}</span></label>)}
            </div>
          </div>
          {message && <p className="mt-5 break-words rounded-lg bg-[var(--paper)] p-3 text-xs">{message}</p>}
          <button disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 py-3 text-xs font-semibold text-white disabled:opacity-50 sm:w-auto">
            {saving ? <LoaderCircle size={14} className="animate-spin"/> : <Save size={14}/>}Save staff member
          </button>
        </form>
      </div>
    </div>
  );
}
