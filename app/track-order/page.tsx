"use client";

import { FormEvent, useState } from "react";
import { Check } from "lucide-react";
import { useCommerce } from "@/components/commerce/CommerceProvider";
import { formatMoney } from "@/lib/products";
import type { DemoOrder } from "@/types/commerce";

export default function TrackOrderPage() {
  const { orders } = useCommerce();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<DemoOrder | null | undefined>(undefined);

  function submit(event: FormEvent) {
    event.preventDefault();
    const match = orders.find((order) => order.id.toLowerCase() === reference.trim().toLowerCase() && order.email.toLowerCase() === email.trim().toLowerCase());
    setResult(match || null);
  }

  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-16 md:px-8 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div><p className="kicker text-[var(--muted)]">Orders</p><h1 className="mt-5 text-[clamp(3.6rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">TRACK AN ORDER.</h1><p className="mt-6 max-w-md text-sm leading-relaxed text-[var(--muted)]">This prototype can look up orders created in this browser. Production tracking should be connected to the real order and fulfilment system.</p></div>
        <form onSubmit={submit} className="max-w-xl"><label className="grid gap-2"><span className="kicker text-[var(--muted)]">Order reference</span><input required value={reference} onChange={(e)=>setReference(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" placeholder="KSI-..." /></label><label className="mt-6 grid gap-2"><span className="kicker text-[var(--muted)]">Order email</span><input required type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="border-b border-black/20 bg-transparent py-3 outline-none" /></label><button className="mt-7 rounded-full bg-[var(--ink)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Find order</button>{result === null && <p className="mt-6 text-sm text-red-800">No prototype order matched those details.</p>}{result && <div className="mt-8 border-y hairline py-5"><p className="inline-flex items-center gap-2 text-sm font-medium"><Check size={14}/>{result.status}</p><p className="mt-3 text-sm text-[var(--muted)]">{result.id} · {formatMoney(result.subtotal)}</p></div>}</form>
      </div>
    </section>
  );
}
