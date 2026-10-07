"use client";

import { useEffect, useState } from "react";
import { Eye, MousePointerClick, Users, UserRoundPlus } from "lucide-react";

type WebAnalyticsPayload = {
  configured: boolean;
  startDate?: string;
  endDate?: string;
  summary?: { activeUsers: number; newUsers: number; sessions: number; pageViews: number };
  pages?: Array<{ path: string; pageViews: number; activeUsers: number }>;
  message?: string;
};

export default function WebAnalyticsPanel({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [payload, setPayload] = useState<WebAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    setLoading(true);
    setError(null);
    fetch(`/api/backoffice/analytics/web${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as WebAnalyticsPayload;
        if (!response.ok) throw new Error(result.message || "Unable to load website analytics.");
        setPayload(result);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load website analytics.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fromDate, toDate]);

  if (loading) return <section className="mx-4 mt-4 rounded-xl border hairline bg-[var(--paper)] p-5 text-sm text-[var(--muted)] sm:mx-6 lg:mx-8">Loading website visitor analytics…</section>;
  if (error) return <section className="mx-4 mt-4 rounded-xl border hairline bg-[var(--paper)] p-5 text-sm text-red-700 sm:mx-6 lg:mx-8">{error}</section>;
  if (!payload?.configured) {
    return <section className="mx-4 mt-4 rounded-xl border hairline bg-[var(--paper)] p-5 sm:mx-6 lg:mx-8"><p className="text-sm font-semibold">Website visitor analytics</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Google Analytics tracking/reporting is ready in the application but is not configured yet. Add the GA4 measurement ID, property ID and read-only service account credentials to the production environment to start collecting and displaying visitor statistics.</p></section>;
  }

  const summary = payload.summary || { activeUsers: 0, newUsers: 0, sessions: 0, pageViews: 0 };
  const rangeLabel = fromDate || toDate ? `${fromDate || "Beginning"} to ${toDate || "Today"}` : "Last 30 days";
  const cards = [
    { label: "Visitors", value: summary.activeUsers, icon: Users },
    { label: "New visitors", value: summary.newUsers, icon: UserRoundPlus },
    { label: "Sessions", value: summary.sessions, icon: MousePointerClick },
    { label: "Page views", value: summary.pageViews, icon: Eye },
  ];

  return (
    <section className="mx-4 mt-4 overflow-hidden rounded-xl border hairline bg-[var(--paper)] sm:mx-6 lg:mx-8">
      <div className="border-b hairline p-5 sm:p-6"><p className="kicker text-[var(--muted)]">Website analytics</p><div className="mt-2 flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-medium tracking-[-0.02em]">Visitors & page activity</h2><span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">{rangeLabel}</span></div></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <div key={label} className="border-b hairline p-5 sm:border-r xl:border-b-0"><Icon size={17} className="text-[var(--muted)]"/><p className="mt-4 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-KE")}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">{label}</p></div>)}</div>
      <div className="border-t hairline p-5 sm:p-6"><h3 className="text-sm font-semibold">Top pages</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left"><thead><tr className="border-b hairline"><th className="py-2 pr-4 text-[9px] uppercase tracking-[0.07em] text-[var(--muted)]">Page</th><th className="px-4 py-2 text-right text-[9px] uppercase tracking-[0.07em] text-[var(--muted)]">Visitors</th><th className="py-2 pl-4 text-right text-[9px] uppercase tracking-[0.07em] text-[var(--muted)]">Views</th></tr></thead><tbody>{(payload.pages || []).map((page) => <tr key={page.path} className="border-b hairline last:border-0"><td className="max-w-[360px] truncate py-3 pr-4 text-xs">{page.path}</td><td className="px-4 py-3 text-right text-xs tabular-nums">{page.activeUsers.toLocaleString("en-KE")}</td><td className="py-3 pl-4 text-right text-xs font-semibold tabular-nums">{page.pageViews.toLocaleString("en-KE")}</td></tr>)}</tbody></table></div></div>
    </section>
  );
}
