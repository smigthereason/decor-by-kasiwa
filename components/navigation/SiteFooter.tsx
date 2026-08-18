import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer className="mt-16 bg-[var(--ink)] text-[var(--paper)]">
      <div className="w-full grid gap-10 border-white/10 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-16">
        <div>
          <p className="kicker text-white/50">Decor by Kasiwa</p>
          <h2 className="mt-5 max-w-4xl text-[clamp(3rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">
            LET&apos;S SHAPE
            <br />
            YOUR SPACE.
          </h2>
          <Link
            href="/consultation"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/30 px-5 py-3 text-xs uppercase tracking-[0.08em]"
          >
            Start a project <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-6 self-end text-sm">
          <div className="space-y-2">
            <p className="kicker mb-4 text-white/40">Explore</p>
            <Link className="block" href="/portfolio">Portfolio</Link>
            <Link className="block" href="/services">Services</Link>
            <Link className="block" href="/shop">Shop</Link>
            <Link className="block" href="/wishlist">Saved items</Link>
            <Link className="block" href="/account">Account</Link>
          </div>
          <div className="space-y-2">
            <p className="kicker mb-4 text-white/40">Studio & support</p>
            <Link className="block" href="/about">About</Link>
            <Link className="block" href="/process">Process</Link>
            <Link className="block" href="/consultation">Consultation</Link>
            <Link className="block" href="/track-order">Track order</Link>
            <Link className="block" href="/delivery">Delivery</Link>
            <Link className="block" href="/returns">Returns</Link>
            <Link className="block" href="/faq">FAQs</Link>
          </div>
        </div>
      </div>
      <div className="w-full flex flex-col gap-2 border-t border-white/10 px-4 py-5 text-[10px] uppercase tracking-[0.12em] text-white/45 sm:flex-row sm:justify-between md:px-8">
        <span>© 2026 Decor by Kasiwa</span>
        <div className="flex gap-4"><Link href="/contact">Contact</Link><span>Nairobi · Kenya</span></div>
      </div>
    </footer>
  );
}
