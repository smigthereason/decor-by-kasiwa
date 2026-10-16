"use client";

import { FormEvent, useEffect, useState } from "react";
import { Building2, ChevronDown, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";

type Location = { _id: string; name: string; code: string; address?: string; active: boolean };
type Editor = { name: string; code: string; address: string; active: boolean };
const blank: Editor = { name: "", code: "", address: "", active: true };

export default function StoreLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Location | null>(null);
  const [editor, setEditor] = useState<Editor>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/backoffice/store-locations", { cache: "no-store" });
    const payload = await response.json() as { locations?: Location[]; message?: string };
    if (!response.ok) throw new Error(payload.message || "Unable to load stores.");
    setLocations(payload.locations || []);
  }

  useEffect(() => { void load().catch((cause) => setMessage(cause instanceof Error ? cause.message : "Unable to load stores.")).finally(() => setLoading(false)); }, []);

  function choose(location: Location | null) {
    setSelected(location);
    setEditor(location ? { name: location.name, code: location.code, address: location.address || "", active: location.active !== false } : blank);
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await fetch(selected ? `/api/backoffice/store-locations/${encodeURIComponent(selected._id)}` : "/api/backoffice/store-locations", {
        method: selected ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to save store.");
      await load();
      setMessage(selected ? "Store updated." : "Store created.");
      if (!selected) setEditor(blank);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to save store."); }
    finally { setSaving(false); }
  }

  async function remove(location: Location) {
    if (!window.confirm(`Delete ${location.name}?`)) return;
    const response = await fetch(`/api/backoffice/store-locations/${encodeURIComponent(location._id)}`, { method: "DELETE" });
    const payload = await response.json() as { message?: string };
    if (!response.ok) { setMessage(payload.message || "Unable to delete store."); return; }
    choose(null); await load();
  }

  return <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
    <div className="mx-auto grid max-w-[1400px] gap-5 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-2xl border hairline bg-white p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="kicker text-[var(--muted)]">Branches</p><h1 className="mt-2 text-2xl font-semibold">Stores / Locations</h1></div><button onClick={() => choose(null)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--brand-green)] px-4 text-xs font-semibold !text-soft-cream"><Plus size={14}/>Add store</button></div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Create the client&apos;s own branches here. Stock and Manager assignments use these records; branch names are never hard-coded.</p>
        <div className="mt-5 space-y-2">{loading ? <LoaderCircle className="animate-spin"/> : locations.map((location) => <button key={location._id} onClick={() => choose(location)} className={`w-full rounded-xl border p-4 text-left ${selected?._id === location._id ? "border-[var(--brand-green)] bg-[var(--brand-green)]/5" : "hairline bg-[var(--paper)]"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{location.name}</p><p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{location.code}</p>{location.address ? <p className="mt-2 text-xs text-[var(--muted)]">{location.address}</p> : null}</div><span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${location.active ? "bg-emerald-50 text-emerald-700" : "bg-black/5 text-[var(--muted)]"}`}>{location.active ? "Active" : "Inactive"}</span></div></button>)}</div>
      </section>
      <section className="rounded-2xl border hairline bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2"><Building2 size={18}/><h2 className="text-lg font-semibold">{selected ? "Edit store" : "Create store"}</h2></div>
        <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-xs font-semibold">Store name<input required value={editor.name} onChange={(e)=>setEditor({...editor,name:e.target.value})} placeholder="e.g. Main Branch" className="min-h-11 rounded-xl border hairline px-4 font-normal"/></label>
          <label className="grid gap-2 text-xs font-semibold">Store code<input required value={editor.code} onChange={(e)=>setEditor({...editor,code:e.target.value})} placeholder="e.g. MAIN" className="min-h-11 rounded-xl border hairline px-4 font-normal"/></label>
          <label className="grid gap-2 text-xs font-semibold sm:col-span-2">Address / description<input value={editor.address} onChange={(e)=>setEditor({...editor,address:e.target.value})} placeholder="Optional" className="min-h-11 rounded-xl border hairline px-4 font-normal"/></label>
          <label className="grid gap-2 text-xs font-semibold">Status<div className="relative"><select value={editor.active ? "active" : "inactive"} onChange={(e)=>setEditor({...editor,active:e.target.value === "active"})} className="min-h-11 w-full appearance-none rounded-xl border hairline bg-white pl-4 pr-11 font-normal"><option value="active">Active</option><option value="inactive">Inactive</option></select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"/></div></label>
          <div className="flex items-end gap-2"><button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-green)] px-5 text-xs font-semibold !text-soft-cream"><Save size={14}/>{saving ? "Saving…" : "Save store"}</button>{selected ? <><button type="button" onClick={()=>choose(null)} className="inline-flex min-h-11 items-center gap-2 rounded-full border hairline px-4 text-xs font-semibold"><X size={14}/>Cancel</button><button type="button" onClick={()=>void remove(selected)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 px-4 text-xs font-semibold text-red-700"><Trash2 size={14}/>Delete</button></> : null}</div>
        </form>{message ? <p className="mt-4 rounded-xl border hairline bg-[var(--paper)] p-3 text-xs">{message}</p> : null}
      </section>
    </div>
  </div>;
}
