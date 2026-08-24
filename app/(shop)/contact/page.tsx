import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="w-full border-b hairline bg-[var(--paper)] px-4 py-16 md:px-8 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div><p className="kicker text-[var(--muted)]">Contact</p><h1 className="mt-5 text-[clamp(3.7rem,9vw,9rem)] font-medium leading-[0.86] tracking-[-0.075em]">LET'S TALK SPACE.</h1></div>
        <div className="self-end"><p className="max-w-xl text-sm leading-relaxed text-[var(--muted)]">For design projects, use the consultation journey so the studio receives the right project context. General contact details can be connected from Sanity once the client confirms the preferred phone, email and social channels.</p><Link href="/consultation" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--paper)]">Book consultation <ArrowRight size={13}/></Link></div>
      </div>
    </section>
  );
}
