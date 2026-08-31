"use client";

import { CheckCircle2 } from "lucide-react";

export default function PosPaymentCompletePage() {
  return (
    <main className="grid min-h-[70vh] place-items-center bg-[var(--paper)] px-5 py-16">
      <div className="max-w-lg text-center">
        <CheckCircle2 size={34} className="mx-auto text-[var(--deep-green)]" />
        <p className="kicker mt-5 text-[var(--muted)]">POS payment</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">Payment submitted.</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Return to the POS window. It will verify the transaction and record the sale automatically.</p>
        <button type="button" onClick={() => window.close()} className="mt-6 min-h-11 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">Close payment window</button>
      </div>
    </main>
  );
}
