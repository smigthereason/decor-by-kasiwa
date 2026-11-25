import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <header className="border-b hairline px-5 py-6 md:px-12">
        <Link href="/" className="font-semibold tracking-tight">Decor by Kasiwa</Link>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-20 [&_h1]:mb-6 [&_h1]:text-4xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-4 [&_p]:leading-relaxed [&_li]:mb-2 [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </main>
      <footer className="flex flex-wrap gap-5 border-t hairline px-5 py-6 text-sm md:px-12">
        <Link href="/privacy-policy">Privacy policy</Link>
        <Link href="/terms-of-service">Terms of service</Link>
        <Link href="/data-deletion">Data deletion</Link>
        <Link href="/shop">Shop</Link>
      </footer>
    </div>
  );
}
