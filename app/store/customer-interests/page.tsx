"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, LoaderCircle, Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type ViewedProduct = {
  productId: string;
  name: string;
  slug: string;
  imageUrl?: string;
  viewedAt: string;
};

type CustomerInsight = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source?: string;
  lastProductViewAt?: string;
  recentlyViewed: ViewedProduct[];
};

export default function CustomerInterestsPage() {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerInsight[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/backoffice/customer-insights${params.size ? `?${params.toString()}` : ""}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as { customers?: CustomerInsight[]; message?: string };
          if (!response.ok) throw new Error(body.message || "Unable to load customer interests.");
          const next = body.customers || [];
          setCustomers(next);
          setSelectedId((current) => (current && next.some((customer) => customer.id === current) ? current : next[0]?.id || ""));
        })
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError(cause instanceof Error ? cause.message : "Unable to load customer interests.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selected = customers.find((customer) => customer.id === selectedId) || null;

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <div className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <p className="kicker text-[var(--muted)]">Customer service</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl lg:text-4xl">Customer product interests</h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--muted)]">Search a known customer by name, email or phone and see products they recently viewed while signed in.</p>

        <label className="relative mt-5 block max-w-2xl">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or phone"
            className="min-h-12 w-full rounded-xl border hairline bg-[var(--paper)] pl-11 pr-4 text-sm outline-none transition focus:border-[var(--brand-green)]"
          />
        </label>
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[0.72fr_1.28fr] lg:p-8">
        <section className="rounded-xl border hairline bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between gap-3 border-b hairline pb-3">
            <div className="flex items-center gap-2"><UserRound size={16} /><p className="kicker text-[var(--muted)]">Customers</p></div>
            <span className="text-[10px] text-[var(--muted)]">{customers.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="animate-spin" /> Loading…</div>
          ) : error ? (
            <p className="py-6 text-sm text-red-700">{error}</p>
          ) : customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">No matching customer found.</p>
          ) : (
            <div className="divide-y hairline">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedId(customer.id)}
                  className={[
                    "w-full px-2 py-4 text-left transition",
                    selectedId === customer.id ? "bg-[var(--paper-2)]" : "hover:bg-[var(--paper-2)]/60",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold">{customer.name || "Customer"}</p>
                  <p className="mt-1 break-all text-[11px] text-[var(--muted)]">{customer.phone || customer.email || "No contact details"}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{customer.recentlyViewed.length} recently viewed</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
          {!selected ? (
            <div className="grid min-h-56 place-items-center text-center text-sm text-[var(--muted)]">Select a customer to view product interests.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b hairline pb-4">
                <div>
                  <p className="kicker text-[var(--muted)]">Selected customer</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{selected.name || "Customer"}</h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">{selected.phone || "No phone"} · {selected.email || "No email"}</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--paper-2)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><Eye size={12} /> {selected.recentlyViewed.length} views</span>
              </div>

              {selected.recentlyViewed.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed hairline p-8 text-center text-sm text-[var(--muted)]">No identified product views for this customer yet.</div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {selected.recentlyViewed.map((item) => (
                    <Link
                      key={`${item.productId}-${item.viewedAt}`}
                      href={item.slug ? `/shop/${encodeURIComponent(item.slug)}` : "/shop"}
                      className="group overflow-hidden rounded-lg border hairline bg-[var(--paper-2)]"
                    >
                      <div className="relative aspect-square bg-white">
                        {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill unoptimized className="object-contain p-3" /> : null}
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-2 text-xs font-semibold group-hover:underline">{item.name}</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">Viewed {new Date(item.viewedAt).toLocaleString("en-KE")}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
