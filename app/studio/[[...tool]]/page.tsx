import Link from "next/link";

export const metadata = {
  title: "Studio",
};

export default async function StudioPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID);

  if (configured) {
    const { default: StudioClient } = await import("./StudioClient");
    return <StudioClient />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <section className="max-w-xl border-y hairline py-10">
        <p className="kicker text-[var(--muted)]">Sanity Studio</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.05em]">
          Studio is not configured yet.
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-[var(--muted)]">
          Add the Sanity project environment variables when the CMS is ready to be connected.
        </p>
        <Link href="/" className="editorial-link mt-7">
          Return to site
        </Link>
      </section>
    </main>
  );
}
