import Link from "next/link";

import {
  ArrowLeft,
  LockKeyhole,
} from "lucide-react";

import type { Metadata } from 'next';


export const metadata: Metadata = {
  title: "Access Restricted",
};

export default function AccessDeniedPage() {
  return (
    <section className="grid min-h-[calc(100vh-140px)] place-items-center bg-[var(--paper)] px-5 py-20 sm:px-8">
      <div className="w-full max-w-xl text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--paper-2)]">
          <LockKeyhole
            size={24}
            strokeWidth={1.4}
            className="text-[var(--deep-green)]"
          />
        </span>

        <p className="kicker mt-7 text-[var(--muted)]">
          Restricted Area
        </p>

        <h1 className="mt-4 text-[clamp(2.8rem,7vw,5.5rem)] font-medium leading-[0.9] tracking-[-0.065em]">
          Access Restricted.
        </h1>

        <p className="mx-auto mt-6 max-w-md text-sm leading-7 text-[var(--muted)]">
          Your account is signed in, but it does not currently have permission to access this business workspace.
        </p>

        <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-[var(--muted)]">
          If you believe you should have access, ask the Decor by Kasiwa administrator to check your staff role.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/account"
            className="focus-ring inline-flex items-center gap-2 rounded-full bg-[var(--deep-green)] px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
          >
            <ArrowLeft size={13} />
            My Account
          </Link>

          <Link
            href="/"
            className="focus-ring inline-flex items-center rounded-full border hairline px-6 py-3.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          >
            Customer Site
          </Link>
        </div>
      </div>
    </section>
  );
}
