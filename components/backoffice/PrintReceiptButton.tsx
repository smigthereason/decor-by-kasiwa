"use client";

import { Printer } from "lucide-react";

export default function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--brand-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2"
    >
      <Printer size={15} aria-hidden="true" /> Print receipt
    </button>
  );
}
