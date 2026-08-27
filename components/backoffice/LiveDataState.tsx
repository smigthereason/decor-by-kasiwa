"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function LiveDataState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="grid min-h-[320px] place-items-center rounded-xl border hairline bg-[var(--paper)] p-8 text-center">
        <div>
          <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-[var(--ink)]/10" />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (!error) return null;

  return (
    <div className="grid min-h-[320px] place-items-center rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <div className="max-w-md">
        <AlertCircle size={28} className="mx-auto text-red-700" />
        <p className="mt-4 text-sm font-semibold text-red-900">Live data unavailable</p>
        <p className="mt-2 text-xs leading-6 text-red-800">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-red-900 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-white"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    </div>
  );
}
