import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer className="w-full bg-[var(--ink)] text-[var(--paper)]">
      {/* MAIN FOOTER CONTENT */}
      <div className="grid w-full gap-10 border-b border-white/10 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-16 lg:px-12">
        {/* LEFT: CTA SECTION */}
        <div>
          <p className="kicker text-white/50">Decor by Kasiwa</p>
          <h2 className="mt-5 max-w-4xl text-[clamp(3rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em]">
            Let&apos;s Shape
            <br />
            Your Space.
          </h2>
          <Link
            href="/consultation"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--paper)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-[var(--ink)] transition-all hover:gap-3 hover:shadow-lg"
          >
            <span>Start a project</span>
            <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        {/* RIGHT: NAVIGATION */}
        <div className="grid grid-cols-2 gap-6 self-end text-sm">
          <div className="space-y-3">
            <p className="kicker mb-4 text-white/40">Explore</p>
            <Link
              href="/portfolio"
              className="group inline-flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white"
            >
              Portfolio
              <ArrowRight size={12} className="opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/services"
              className="group block text-sm text-white/80 transition-colors hover:text-white"
            >
              Services
            </Link>
            <Link
              href="/shop"
              className="group block text-sm text-white/80 transition-colors hover:text-white"
            >
              Shop
            </Link>
            <Link
              href="/wishlist"
              className="group block text-sm text-white/80 transition-colors hover:text-white"
            >
              Saved items
            </Link>
            <Link
              href="/account"
              className="group block text-sm text-white/80 transition-colors hover:text-white"
            >
              Account
            </Link>
          </div>
          <div className="space-y-3">
            <p className="kicker mb-4 text-white/40">Studio & Support</p>
            <Link
              href="/about"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              About
            </Link>
            <Link
              href="/process"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              Process
            </Link>
            <Link
              href="/consultation"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              Consultation
            </Link>
            <Link
              href="/track-order"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              Track order
            </Link>
            <Link
              href="/delivery"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              Delivery
            </Link>
            <Link
              href="/returns"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              Returns
            </Link>
            <Link
              href="/faq"
              className="block text-sm text-white/80 transition-colors hover:text-white"
            >
              FAQs
            </Link>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="flex w-full flex-col gap-3 border-t border-white/10 px-4 py-5 text-[10px] uppercase tracking-[0.08em] text-white/45 sm:flex-row sm:items-center sm:justify-between md:px-8 lg:px-12">
        <span>© 2026 Decor by Kasiwa</span>
        <div className="flex items-center gap-4">
          <Link
            href="/contact"
            className="transition-colors hover:text-white"
          >
            Contact
          </Link>
          <span className="h-px w-4 bg-white/20" />
          <span>Nairobi · Kenya</span>
        </div>
      </div>
    </footer>
  );
}
