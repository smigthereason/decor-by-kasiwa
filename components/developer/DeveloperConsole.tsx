"use client";

import { useMemo, useState } from "react";

type AuditEvent = {
  id: string; eventNumber: string; eventType: string; entityType?: string; entityId?: string;
  entityLabel?: string; actorName?: string; actorEmail?: string; actorRole?: string; detail?: string; createdAt: string;
};
type Period = "day" | "week" | "month";

function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
  catch { return value; }
}
function periodStart(period: Period) {
  const now = new Date();
  const days = period === "day" ? 1 : period === "week" ? 7 : 31;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

export default function DeveloperConsole({ events, totalRecorded, accessEmail }: { events: AuditEvent[]; totalRecorded: number; accessEmail: string }) {
  const [period, setPeriod] = useState<Period>("day");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [actor, setActor] = useState("");

  const filtered = useMemo(() => {
    const cutoff = periodStart(period);
    const q = query.trim().toLowerCase();
    const a = actor.trim().toLowerCase();
    return events.filter((event) => {
      if (new Date(event.createdAt).getTime() < cutoff) return false;
      const actorText = `${event.actorName || ""} ${event.actorEmail || ""}`.toLowerCase();
      if (a && !actorText.includes(a)) return false;
      if (!q) return true;
      return [event.eventType, event.actorName, event.actorEmail, event.actorRole, event.entityLabel, event.eventNumber, event.detail]
        .some((value) => (value || "").toLowerCase().includes(q));
    });
  }, [events, period, query, actor]);

  const errors = filtered.filter((event) => event.eventType === "CLIENT_ERROR").length;

  return <main className="min-h-screen bg-[#f6f4ee] px-3 py-5 text-[#1f2a24] sm:px-6 sm:py-8 lg:px-10">
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 border-b border-black/10 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#53705d]">Private diagnostics</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Developer Console</h1>
        <p className="mt-1 max-w-3xl text-sm text-black/60">Staff activity, client failures and operational audit events.</p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-[11px] uppercase text-black/45">Recorded events</p><p className="mt-1 text-2xl font-semibold">{totalRecorded.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-[11px] uppercase text-black/45">Showing</p><p className="mt-1 text-2xl font-semibold">{filtered.length.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-[11px] uppercase text-black/45">Errors in view</p><p className="mt-1 text-2xl font-semibold">{errors}</p></div>
        <div className="col-span-2 rounded-2xl border border-black/10 bg-white p-4 lg:col-span-1"><p className="text-[11px] uppercase text-black/45">Signed in</p><p className="mt-1 break-all text-sm font-semibold">{accessEmail}</p></div>
      </section>

      <section className="mb-4 rounded-2xl border border-black/10 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex rounded-xl bg-black/[0.04] p-1">
            {(["day", "week", "month"] as Period[]).map((value) => <button key={value} onClick={() => setPeriod(value)} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize lg:flex-none ${period === value ? "bg-white shadow-sm" : "text-black/55"}`}>{value}</button>)}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search errors, events, references or staff…" className="min-h-11 flex-1 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#53705d]" />
          <div className="flex min-w-0 gap-2">
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Monitor staff member…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#53705d]" />
            {actor ? <button onClick={() => setActor("")} className="rounded-xl border border-black/10 px-3 text-sm">Clear</button> : null}
          </div>
        </div>
      </section>

      <div className="hidden overflow-hidden rounded-2xl border border-black/10 bg-white md:block">
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase text-black/50"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Detail</th></tr></thead>
          <tbody className="divide-y divide-black/5">{filtered.map((event) => <tr key={event.id} onClick={() => setSelected(event)} className="cursor-pointer align-top hover:bg-black/[0.025]">
            <td className="whitespace-nowrap px-4 py-3 text-xs text-black/55">{formatDate(event.createdAt)}</td><td className="px-4 py-3 font-medium">{event.eventType}</td>
            <td className="px-4 py-3"><button onClick={(e) => { e.stopPropagation(); setActor(event.actorName || event.actorEmail || ""); }} className="text-left hover:underline">{event.actorName || "System"}</button></td>
            <td className="px-4 py-3 text-black/60">{event.actorRole || "—"}</td><td className="px-4 py-3 text-black/60">{event.entityLabel || event.eventNumber || "—"}</td><td className="max-w-md truncate px-4 py-3 text-black/70">{event.detail || "—"}</td>
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="grid gap-3 md:hidden">{filtered.map((event) => <button key={event.id} onClick={() => setSelected(event)} className="rounded-2xl border border-black/10 bg-white p-4 text-left">
        <div className="flex items-start justify-between gap-3"><span className="break-all text-sm font-semibold">{event.eventType}</span><span className="whitespace-nowrap text-[11px] text-black/45">{formatDate(event.createdAt)}</span></div>
        <p className="mt-2 text-sm">{event.actorName || "System"} <span className="text-black/45">· {event.actorRole || "—"}</span></p><p className="mt-1 line-clamp-2 text-xs text-black/60">{event.detail || event.entityLabel || "No additional detail"}</p>
      </button>)}</div>
      {filtered.length === 0 ? <div className="rounded-2xl border border-black/10 bg-white px-4 py-10 text-center text-sm text-black/50">No events match the selected filters.</div> : null}
    </div>

    {selected ? <div className="fixed inset-0 z-50 flex items-end bg-black/45 p-0 sm:items-center sm:justify-center sm:p-5" onClick={() => setSelected(null)}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-2xl sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-black/45">Event detail</p><h2 className="mt-1 break-all text-xl font-semibold">{selected.eventType}</h2></div><button onClick={() => setSelected(null)} className="rounded-xl border border-black/10 px-3 py-2 text-sm">Close</button></div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          {[['Time', formatDate(selected.createdAt)], ['Actor', selected.actorName || 'System'], ['Email', selected.actorEmail || '—'], ['Role', selected.actorRole || '—'], ['Event number', selected.eventNumber || '—'], ['Reference', selected.entityLabel || '—'], ['Entity type', selected.entityType || '—'], ['Entity ID', selected.entityId || '—']].map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-xs uppercase text-black/40">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
        </dl>
        <div className="mt-5 rounded-2xl bg-black/[0.035] p-4"><p className="text-xs uppercase text-black/40">Detail</p><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6">{selected.detail || "No additional detail recorded."}</pre></div>
        {selected.actorName || selected.actorEmail ? <button onClick={() => { setActor(selected.actorName || selected.actorEmail || ""); setSelected(null); }} className="mt-4 w-full rounded-xl bg-[#1f2a24] px-4 py-3 text-sm font-semibold text-white">Monitor this staff member</button> : null}
      </div>
    </div> : null}
  </main>;
}
