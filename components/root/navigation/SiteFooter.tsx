import Link from "next/link";
import { ArrowRight, Instagram, Mail } from "lucide-react";

function TikTokIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M14.4 3c.3 2.3 1.6 3.7 3.8 4v3.2c-1.5 0-2.8-.4-3.8-1.1v6.1a5.4 5.4 0 1 1-4.7-5.4v3.3a2.2 2.2 0 1 0 1.5 2.1V3h3.2Z" />
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <footer
      className="w-full bg-[var(--brand-green)] text-[var(--paper)]"
      aria-label="Website footer"
    >
      {/* MAIN FOOTER CONTENT */}
      <div className="grid w-full gap-10 border-b border-soft-cream/15 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:px-8 md:py-16 lg:px-12">
        {/* LEFT: CTA SECTION */}
        <div>
          <p className="kicker text-soft-cream/70">Decor by Kasiwa</p>

          <h2 className="mt-5 max-w-4xl text-[clamp(3rem,8vw,8rem)] font-medium leading-[0.86] tracking-[-0.075em] text-soft-cream">
            Let&apos;s Shape
            <br />
            Your Space.
          </h2>
        </div>

        {/* RIGHT: NAVIGATION */}
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-6 self-end text-sm"
        >
          {/* EXPLORE */}
          <div className="space-y-3">
            <p className="kicker mb-4 text-soft-cream/60">Explore</p>

            <Link
              href="/portfolio"
              className="group inline-flex min-h-8 items-center gap-1 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-green)]"
            >
              Portfolio
              <ArrowRight
                size={13}
                className="opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
              />
            </Link>

            <Link
              href="/services"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Services
            </Link>

            <Link
              href="/shop"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Shop
            </Link>

            <Link
              href="/wishlist"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Saved items
            </Link>

            <Link
              href="/account"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Account
            </Link>
          </div>

          {/* SUPPORT */}
          <div className="space-y-3">
            <p className="kicker mb-4 text-soft-cream/60">
              Studio &amp; Support
            </p>

            <Link
              href="/about"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              About
            </Link>

            <Link
              href="/process"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Process
            </Link>

            <Link
              href="/consultation"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Consultation
            </Link>

            <Link
              href="/track-order"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Track order
            </Link>

            <Link
              href="/delivery"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Delivery
            </Link>

            <Link
              href="/returns"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Returns
            </Link>

            <Link
              href="/faq"
              className="block min-h-8 text-sm text-soft-cream/90 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              FAQs
            </Link>
          </div>
        </nav>
      </div>

      {/* SOCIAL + CONTACT SECTION */}
      <div className="border-b border-soft-cream/15 px-4 py-6 md:px-8 lg:px-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* SOCIAL MEDIA */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-soft-cream/70">
              Follow us
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {/* TIKTOK */}
              <a
                href="https://www.tiktok.com/@decorbykasiwa"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Decor by Kasiwa on TikTok"
                className="group inline-flex min-h-11 items-center gap-2.5 rounded-full border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:border-white hover:bg-white hover:!text-[var(--brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-green)]"
              >
                <TikTokIcon className="size-5 shrink-0" />
                <span>TikTok</span>
              </a>

              {/* INSTAGRAM */}
              <a
                href="https://www.instagram.com/decorbykasiwa?stkn=ZmtlY3gwZmpiam5t&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Follow Decor by Kasiwa on Instagram"
                className="group inline-flex min-h-11 items-center gap-2.5 rounded-full border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:border-white hover:bg-white hover:!text-[var(--brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-green)]"
              >
                <Instagram size={20} strokeWidth={2.2} aria-hidden="true" />
                <span>Instagram</span>
              </a>
            </div>
          </div>

          {/* CONTACT CTA */}
          <div className="sm:text-right">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-soft-cream/70">
              Need help?
            </p>

            <Link
              href="/contact"
              className="group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold !text-[var(--brand-green)] shadow-sm transition-all duration-200 hover:shadow-lg hover:ring-2 hover:ring-white/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-green)]"
            >
              <Mail size={18} strokeWidth={2.2} aria-hidden="true" />
              <span>Contact us</span>
              <ArrowRight
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div className="flex w-full flex-col gap-3 px-4 py-5 text-xs text-soft-cream/75 sm:flex-row sm:items-center sm:justify-between md:px-8 lg:px-12">
        <span>© 2026 Decor by Kasiwa</span>

        <div className="flex flex-wrap items-center gap-3">
          <span>Nairobi · Kenya</span>
        </div>
      </div>
    </footer>
  );
}
