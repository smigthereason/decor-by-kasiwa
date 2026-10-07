"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, LoaderCircle } from "lucide-react";
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
  recentlyViewed: ViewedProduct[];
};

export default function CustomerInterestPanel({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<CustomerInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/backoffice/customer-insights?id=${encodeURIComponent(customerId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { customers?: CustomerInsight[]; message?: string };
        if (!response.ok) throw new Error(body.message || "Unable to load customer interests.");
        setCustomer(body.customers?.[0] || null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load customer interests.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [customerId]);

  return (
    <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Eye size={17} />
        <div>
          <p className="kicker text-[var(--muted)]">Product interest</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Recently viewed products from this customer&apos;s signed-in shopping activity.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle size={15} className="animate-spin" /> Loading viewed products…</div>
      ) : error ? (
        <p className="mt-5 text-sm text-red-700">{error}</p>
      ) : !customer?.recentlyViewed?.length ? (
        <div className="mt-5 rounded-lg border border-dashed hairline p-6 text-center text-sm text-[var(--muted)]">No identified product views yet.</div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {customer.recentlyViewed.map((item) => (
            <Link
              key={`${item.productId}-${item.viewedAt}`}
              href={item.slug ? `/shop/${encodeURIComponent(item.slug)}` : "/shop"}
              className="group flex min-w-0 gap-3 rounded-lg border hairline bg-[var(--paper-2)] p-3 transition hover:bg-[var(--paper)]"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-white">
                {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} fill unoptimized className="object-contain p-1.5" /> : null}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-xs font-semibold group-hover:underline">{item.name}</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">{new Date(item.viewedAt).toLocaleString("en-KE")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
