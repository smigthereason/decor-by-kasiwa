import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth/options";
import { getAuditTrail } from "@/lib/pos/operations";

export const dynamic = "force-dynamic";

const DEVELOPER_EMAIL = "victor.dmaina@gmail.com";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Africa/Nairobi",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function DeveloperPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/account/login?callbackUrl=%2Fdeveloper");
  if (session.user.email.trim().toLowerCase() !== DEVELOPER_EMAIL) notFound();

  const events = await getAuditTrail(300);

  return (
    <main className="min-h-screen bg-[#f6f4ee] px-4 py-8 text-[#1f2a24] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-2 border-b border-black/10 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#53705d]">Private diagnostics</p>
          <h1 className="text-3xl font-semibold tracking-tight">Developer Console</h1>
          <p className="max-w-3xl text-sm text-black/60">Recent staff activity, client failures and operational audit events. This route is intentionally absent from application navigation.</p>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-wide text-black/45">Events loaded</p><p className="mt-1 text-2xl font-semibold">{events.length}</p></div>
          <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-wide text-black/45">Client errors</p><p className="mt-1 text-2xl font-semibold">{events.filter((event) => event.eventType === "CLIENT_ERROR").length}</p></div>
          <div className="rounded-2xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-wide text-black/45">Access</p><p className="mt-1 text-sm font-semibold">{session.user.email}</p></div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-black/10 bg-black/[0.025] text-xs uppercase tracking-wide text-black/50">
                <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Detail</th></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {events.map((event) => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-black/55">{formatDate(event.createdAt)}</td>
                    <td className="px-4 py-3 font-medium">{event.eventType}</td>
                    <td className="px-4 py-3">{event.actorName || "System"}</td>
                    <td className="px-4 py-3 text-black/60">{event.actorRole || "—"}</td>
                    <td className="px-4 py-3 text-black/60">{event.entityLabel || event.eventNumber || "—"}</td>
                    <td className="max-w-xl px-4 py-3 text-black/70">{event.detail || "—"}</td>
                  </tr>
                ))}
                {events.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-black/50">No diagnostic events recorded yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
