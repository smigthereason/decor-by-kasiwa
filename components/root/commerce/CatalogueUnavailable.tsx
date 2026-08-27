"use client";

import { RefreshCw } from "lucide-react";

export default function CatalogueUnavailable({ message }: { message?: string | null }) {
  return (
    <section className="grid min-h-[60vh] place-items-center bg-[var(--paper)] px-4 py-16 text-center">
      <div className="max-w-lg">
        <p className="kicker text-[var(--muted)]">Catalogue unavailable</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.045em]">
          We could not refresh product availability.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
          {message || "Please refresh the page and try again."}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[11px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    </section>
  );
}
