"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Layers3, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import { formatMoney } from "@/lib/money";

type Mode = "admin" | "store";

type LookRow = {
  _id: string;
  title?: string;
  slug?: string;
  description?: string;
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  heroImageUrl?: string;
  spaceTitle?: string;
  styleTitle?: string;
  products?: Array<{
    productId?: string;
    productName?: string;
    productImage?: string;
    productPrice?: number;
    quantity?: number;
  }>;
};

type Payload = { looks: LookRow[] };

export default function ShopLooksManagerPage({ mode }: { mode: Mode }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const basePath = mode === "admin" ? "/admin/shop-looks" : "/store/shop-looks";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backoffice/shop-looks", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "Shop by Look could not be loaded.");
      setData(payload as Payload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shop by Look could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const looks = data?.looks || [];
    return {
      total: looks.length,
      live: looks.filter((look) => look.active !== false).length,
      featured: looks.filter((look) => look.featured).length,
    };
  }, [data]);

  async function removeLook(look: LookRow) {
    if (!window.confirm(`Delete “${look.title || "this look"}”? This cannot be undone.`)) return;
    setDeletingId(look._id);
    setMessage(null);
    try {
      const response = await fetch(`/api/backoffice/shop-looks/${encodeURIComponent(look._id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Delete failed.");
      setMessage("Look deleted.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <section className="border-b hairline bg-[var(--paper)] px-4 py-7 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="kicker text-[var(--muted)]">Merchandising</p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">Shop by Look</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Build curated room edits from the live product catalogue. Admin and Store Manager can publish, feature and reorder looks without changing product inventory.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/shop-by-look"
              target="_blank"
              className="group inline-flex min-h-11 items-center gap-2 rounded-full border hairline px-4 text-[10px] font-semibold uppercase tracking-[0.08em]"
            >
              Customer view <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={`${basePath}/new`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream"
            >
              <Plus size={14} /> Create look
            </Link>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3 sm:max-w-xl">
          {[
            ["Total", stats.total],
            ["Live", stats.live],
            ["Featured", stats.featured],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border hairline bg-[var(--paper-2)] p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </section>

      <section className="p-4 sm:p-6 lg:p-8">
        {!data ? (
          <LiveDataState loading={loading} error={error} onRetry={load} />
        ) : data.looks.length === 0 ? (
          <div className="rounded-2xl border hairline bg-[var(--paper)] p-8 text-center sm:p-12">
            <Layers3 size={34} strokeWidth={1.2} className="mx-auto text-[var(--deep-green)]" />
            <h2 className="mt-5 text-xl font-semibold">Create the first customer look</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
              Select products, set quantities, add a room/style and publish. The look appears immediately on the customer Shop by Look page.
            </p>
            <Link href={`${basePath}/new`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream">
              <Plus size={14} /> Create first look
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.looks.map((look) => {
              const productCount = look.products?.length || 0;
              const totalPrice = (look.products || []).reduce(
                (sum, line) => sum + Number(line.productPrice || 0) * Math.max(1, Number(line.quantity || 1)),
                0,
              );
              return (
                <article key={look._id} className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]">
                  <div className="relative aspect-[16/9] bg-[var(--warm-beige)]">
                    {look.heroImageUrl || look.products?.find((line) => line.productImage)?.productImage ? (
                      <Image
                        src={look.heroImageUrl || look.products?.find((line) => line.productImage)?.productImage || ""}
                        alt={look.title || "Shop look"}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-[var(--deep-green)]"><Layers3 size={34} strokeWidth={1.1} /></div>
                    )}
                    <div className="absolute left-3 top-3 flex gap-2">
                      <span className="rounded-full bg-[var(--paper)]/95 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.09em]">
                        {look.active === false ? "Hidden" : "Live"}
                      </span>
                      {look.featured && <span className="rounded-full bg-[var(--deep-green)] px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.09em] !text-soft-cream">Featured</span>}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-[var(--muted)]">
                      {[look.spaceTitle, look.styleTitle].filter(Boolean).join(" · ") || "Curated look"}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{look.title || "Untitled look"}</h2>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{look.description}</p>
                    <div className="mt-5 flex items-center justify-between border-t hairline pt-4 text-xs">
                      <span className="text-[var(--muted)]">{productCount} products</span>
                      <span className="font-semibold">{formatMoney(totalPrice)}</span>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3">
                      <Link
                        href={`${basePath}/${encodeURIComponent(look._id)}`}
                        className="group inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border hairline px-4 text-[9px] font-semibold uppercase tracking-[0.08em] transition hover:border-[var(--deep-green)]"
                      >
                        Edit look <ArrowUpRight size={13} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void removeLook(look)}
                        disabled={deletingId === look._id}
                        className="grid size-10 shrink-0 place-items-center rounded-full border hairline text-[var(--muted)] transition hover:border-red-300 hover:text-red-700 disabled:opacity-40"
                        aria-label={`Delete ${look.title || "look"}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
