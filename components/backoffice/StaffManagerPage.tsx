"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, LoaderCircle, LogIn, Plus, Save, UserCog, Wifi, WifiOff } from "lucide-react";

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
type ActivitySummary = { online: boolean; lastSeenAt?: string; todayMinutes: number; sevenDayMinutes: number; loginCount: number };
type StaffSession = {
  _id: string;
  loginAt: string;
  lastSeenAt: string;
  logoutAt?: string;
  durationMinutes?: number;
  status?: "ACTIVE" | "ENDED";
  lastRoute?: string;
  online?: boolean;
};
type ActivityItem = {
  id: string;
  eventNumber: string;
  eventType: string;
  entityType?: string;
  entityLabel?: string;
  detail?: string;
  createdAt: string;
};
type ActivityPayload = { summary: ActivitySummary; sessions: StaffSession[]; activity: ActivityItem[] };

const blank: Editor = { name: "", email: "", role: "STORE_STAFF", permissions: [], status: "ACTIVE" };

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formatMinutes(value = 0) {
  const total = Math.max(0, Math.round(value));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function eventLabel(value: string) {
  return value
    .replace(/^STAFF_/, "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StaffManagerPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [editor, setEditor] = useState<Editor>(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");

  async function load() {
    const response = await fetch("/api/backoffice/staff", { cache: "no-store" });
    const payload = await response.json() as { staff?: Staff[]; message?: string };
    if (!response.ok) throw new Error(payload.message || "Unable to load staff.");
    setStaff(payload.staff || []);
  }

  async function loadActivity(id: string) {
    setActivityLoading(true);
    setActivityError("");
    try {
      const response = await fetch(`/api/backoffice/staff/${encodeURIComponent(id)}/activity`, { cache: "no-store" });
      const payload = await response.json() as ActivityPayload & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to load staff activity.");
      setActivity(payload);
    } catch (cause) {
      setActivity(null);
      setActivityError(cause instanceof Error ? cause.message : "Unable to load staff activity.");
    } finally {
      setActivityLoading(false);
    }
  }

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load staff.")).finally(() => setLoading(false));
  }, []);

  function choose(item: Staff | null) {
    setSelected(item);
    setEditor(item ? { name: item.name, email: item.email, role: item.role, permissions: item.permissions || [], status: item.status } : blank);
    setMessage("");
    setActivity(null);
    setActivityError("");
    if (item) void loadActivity(item._id);
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
      if (selected) await loadActivity(selected._id);
      else choose(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save staff member.");
    } finally {
      setSaving(false);
    }
  }

  const latestSessions = useMemo(() => activity?.sessions.slice(0, 12) || [], [activity]);
  const latestActivity = useMemo(() => activity?.activity.slice(0, 40) || [], [activity]);

  return (
    <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid w-full max-w-[1500px] items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-5 xl:flex xl:max-h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="kicker text-[var(--muted)]">People</p><h1 className="mt-2 text-2xl font-semibold">Staff</h1></div>
            <button onClick={() => choose(null)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--brand-green)] px-4 py-2 text-xs font-semibold text-white"><Plus size={14}/>Add staff</button>
          </div>
          <div className="mt-5 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
            {loading ? <LoaderCircle className="animate-spin" /> : staff.map((item) => (
              <button key={item._id} onClick={() => choose(item)} className={`w-full min-w-0 rounded-xl border p-3 text-left transition-colors ${selected?._id === item._id ? "border-[var(--brand-green)] bg-[var(--brand-green)]/5" : "hairline bg-[var(--paper)] hover:bg-white"}`}>
                <p className="truncate text-sm font-semibold">{item.name}</p>
                <p className="mt-1 break-all text-[10px] leading-4 text-[var(--muted)]">{item.email}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">{roles.find(([value]) => value === item.role)?.[1]} · {item.status}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border hairline bg-white xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:overscroll-contain">
          <form onSubmit={save} className="p-4 sm:p-6">
            <div className="flex items-center gap-2"><UserCog size={18}/><h2 className="text-base font-semibold sm:text-lg">{selected ? "Edit staff member" : "Pre-register staff member"}</h2></div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">Use the employee&apos;s work email and assign the correct role. New staff can use Forgot password on the sign-in page to securely set their first password.</p>
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
            <button disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-5 py-3 text-xs font-semibold text-white disabled:opacity-50 sm:w-auto">
              {saving ? <LoaderCircle size={14} className="animate-spin"/> : <Save size={14}/>}Save staff member
            </button>
          </form>

          {selected && (
            <div className="border-t hairline p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><Activity size={17}/><h2 className="text-base font-semibold sm:text-lg">Activity & online time</h2></div>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Tracks back-office sessions, page visits, meaningful controls and recorded operational actions. Passwords and form values are never recorded.</p>
                </div>
                <button type="button" onClick={() => void loadActivity(selected._id)} disabled={activityLoading} className="inline-flex min-h-9 items-center gap-2 rounded-full border hairline px-4 text-[10px] font-semibold uppercase tracking-[0.08em] disabled:opacity-50">
                  {activityLoading && <LoaderCircle size={13} className="animate-spin"/>}Refresh
                </button>
              </div>

              {activityLoading && !activity ? <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle size={15} className="animate-spin"/>Loading staff activity…</div> : null}
              {activityError ? <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{activityError}</p> : null}

              {activity && (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border hairline bg-[var(--paper)] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{activity.summary.online ? <Wifi size={14}/> : <WifiOff size={14}/>}Status</div>
                      <p className="mt-2 text-lg font-semibold">{activity.summary.online ? "Online" : "Offline"}</p>
                    </div>
                    <div className="rounded-xl border hairline bg-[var(--paper)] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><Clock3 size={14}/>Today</div>
                      <p className="mt-2 text-lg font-semibold">{formatMinutes(activity.summary.todayMinutes)}</p>
                    </div>
                    <div className="rounded-xl border hairline bg-[var(--paper)] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><Clock3 size={14}/>Last 7 days</div>
                      <p className="mt-2 text-lg font-semibold">{formatMinutes(activity.summary.sevenDayMinutes)}</p>
                    </div>
                    <div className="rounded-xl border hairline bg-[var(--paper)] p-4">
                      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><LogIn size={14}/>Last seen</div>
                      <p className="mt-2 text-xs font-semibold leading-5">{formatDate(activity.summary.lastSeenAt)}</p>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Login sessions</h3><span className="text-[10px] text-[var(--muted)]">{activity.summary.loginCount} tracked</span></div>
                    {latestSessions.length ? (
                      <div className="mt-3 overflow-hidden rounded-xl border hairline">
                        <div className="hidden grid-cols-[1.1fr_1.1fr_0.6fr_1.2fr] gap-3 border-b hairline bg-[var(--paper)] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] md:grid">
                          <span>Login</span><span>Logout / last seen</span><span>Online time</span><span>Last page</span>
                        </div>
                        <div className="divide-y divide-black/5">
                          {latestSessions.map((session) => (
                            <div key={session._id} className="grid gap-2 px-4 py-4 text-xs md:grid-cols-[1.1fr_1.1fr_0.6fr_1.2fr] md:gap-3">
                              <div><span className="text-[9px] uppercase text-[var(--muted)] md:hidden">Login · </span>{formatDate(session.loginAt)}</div>
                              <div><span className="text-[9px] uppercase text-[var(--muted)] md:hidden">Logout / last seen · </span>{session.online ? "Online now" : formatDate(session.logoutAt || session.lastSeenAt)}</div>
                              <div className="font-semibold"><span className="text-[9px] font-normal uppercase text-[var(--muted)] md:hidden">Online time · </span>{formatMinutes(session.durationMinutes)}</div>
                              <div className="min-w-0 break-words text-[var(--muted)]"><span className="text-[9px] uppercase md:hidden">Last page · </span>{session.lastRoute || "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <p className="mt-3 rounded-xl border hairline bg-[var(--paper)] p-4 text-xs text-[var(--muted)]">No staff sessions have been recorded yet. Tracking starts after this update is deployed.</p>}
                  </div>

                  <div className="mt-7">
                    <h3 className="text-sm font-semibold">Recent activity</h3>
                    {latestActivity.length ? (
                      <div className="mt-3 space-y-2">
                        {latestActivity.map((item) => (
                          <div key={item.id} className="rounded-xl border hairline bg-[var(--paper)] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold">{eventLabel(item.eventType)}</p>
                                {item.entityLabel ? <p className="mt-1 break-words text-[11px] text-[var(--muted)]">{item.entityLabel}</p> : null}
                              </div>
                              <time className="text-[10px] text-[var(--muted)]">{formatDate(item.createdAt)}</time>
                            </div>
                            {item.detail ? <p className="mt-2 break-words text-[11px] leading-5 text-[var(--muted)]">{item.detail}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-3 rounded-xl border hairline bg-[var(--paper)] p-4 text-xs text-[var(--muted)]">No activity has been recorded for this staff member yet.</p>}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
