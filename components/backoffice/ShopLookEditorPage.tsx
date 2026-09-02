"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, ImagePlus, Layers3, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import LiveDataState from "@/components/backoffice/LiveDataState";
import { formatMoney } from "@/lib/money";

type Mode = "admin" | "store";

type ProductOption = {
  _id: string;
  name?: string;
  sku?: string;
  price?: number;
  initialStock?: number;
  available?: boolean;
  image?: string;
};

type TaxonomyOption = { _id: string; title?: string };

type ExistingLook = {
  _id: string;
  title?: string;
  slug?: string;
  eyebrow?: string;
  description?: string;
  featured?: boolean;
  active?: boolean;
  displayOrder?: number;
  seoTitle?: string;
  seoDescription?: string;
  heroImageUrl?: string;
  spaceId?: string;
  styleId?: string;
  products?: Array<{ productId?: string; quantity?: number; note?: string }>;
};

type ApiPayload = {
  looks: ExistingLook[];
  products: ProductOption[];
  spaces: TaxonomyOption[];
  styles: TaxonomyOption[];
};

type SelectedProduct = { productId: string; quantity: number; note: string };

type FormState = {
  title: string;
  slug: string;
  eyebrow: string;
  description: string;
  spaceId: string;
  styleId: string;
  featured: boolean;
  active: boolean;
  displayOrder: number;
  seoTitle: string;
  seoDescription: string;
  products: SelectedProduct[];
};

const emptyForm: FormState = {
  title: "",
  slug: "",
  eyebrow: "",
  description: "",
  spaceId: "",
  styleId: "",
  featured: false,
  active: true,
  displayOrder: 100,
  seoTitle: "",
  seoDescription: "",
  products: [],
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export default function ShopLookEditorPage({ mode, lookId }: { mode: Mode; lookId?: string }) {
  const router = useRouter();
  const basePath = mode === "admin" ? "/admin/shop-looks" : "/store/shop-looks";
  const [data, setData] = useState<ApiPayload | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(lookId));
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [existingHeroImageUrl, setExistingHeroImageUrl] = useState("");
  const [heroImagePreviewUrl, setHeroImagePreviewUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backoffice/shop-looks", { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Shop the Look could not be loaded.");
      setData(payload);

      if (lookId) {
        const existing = payload.looks.find((look) => look._id === lookId);
        if (!existing) throw new Error("This look no longer exists.");
        setExistingHeroImageUrl(existing.heroImageUrl || "");
        setForm({
          title: existing.title || "",
          slug: existing.slug || "",
          eyebrow: existing.eyebrow || "",
          description: existing.description || "",
          spaceId: existing.spaceId || "",
          styleId: existing.styleId || "",
          featured: existing.featured === true,
          active: existing.active !== false,
          displayOrder: Number(existing.displayOrder ?? 100),
          seoTitle: existing.seoTitle || "",
          seoDescription: existing.seoDescription || "",
          products: (existing.products || [])
            .filter((line): line is typeof line & { productId: string } => Boolean(line.productId))
            .map((line) => ({
              productId: line.productId,
              quantity: Math.max(1, Number(line.quantity || 1)),
              note: line.note || "",
            })),
        });
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shop the Look could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [lookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const productMap = useMemo(
    () => new Map((data?.products || []).map((product) => [product._id, product])),
    [data?.products],
  );

  const selectedIds = useMemo(() => new Set(form.products.map((line) => line.productId)), [form.products]);

  const availableProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.products || [])
      .filter((product) => {
        if (selectedIds.has(product._id)) return false;
        if (!term) return true;
        return [product.name, product.sku]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      })
      .slice(0, 80);
  }, [data?.products, search, selectedIds]);

  const totalPrice = form.products.reduce((sum, line) => {
    const product = productMap.get(line.productId);
    return sum + Number(product?.price || 0) * line.quantity;
  }, 0);

  useEffect(() => {
    if (!heroImageFile) {
      setHeroImagePreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(heroImageFile);
    setHeroImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [heroImageFile]);

  const previewImage =
    heroImagePreviewUrl ||
    existingHeroImageUrl ||
    form.products.map((line) => productMap.get(line.productId)?.image).find(Boolean) ||
    undefined;

  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function addProduct(productId: string) {
    if (selectedIds.has(productId)) return;
    setForm((current) => ({
      ...current,
      products: [...current.products, { productId, quantity: 1, note: "" }],
    }));
  }

  function updateProduct(productId: string, patch: Partial<SelectedProduct>) {
    setForm((current) => ({
      ...current,
      products: current.products.map((line) =>
        line.productId === productId ? { ...line, ...patch } : line,
      ),
    }));
  }

  function removeProduct(productId: string) {
    setForm((current) => ({
      ...current,
      products: current.products.filter((line) => line.productId !== productId),
    }));
  }

  async function save() {
    if (saving) return;
    if (form.title.trim().length < 3) {
      setMessage("Enter a look name.");
      return;
    }
    if (form.description.trim().length < 20) {
      setMessage("Add a fuller description of at least 20 characters.");
      return;
    }
    if (!form.products.length) {
      setMessage("Add at least one product to the look.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const url = lookId
        ? `/api/backoffice/shop-looks/${encodeURIComponent(lookId)}`
        : "/api/backoffice/shop-looks";
      const payloadForm = new FormData();
      payloadForm.set("payload", JSON.stringify({ ...form, slug: form.slug || toSlug(form.title) }));
      if (heroImageFile) payloadForm.set("heroImage", heroImageFile);

      const response = await fetch(url, {
        method: lookId ? "PATCH" : "POST",
        body: payloadForm,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || "Save failed.");

      setMessage(lookId ? "Look updated and saved to Sanity." : "Look created in Sanity.");
      setHeroImageFile(null);
      if (!lookId && payload?.id) {
        router.replace(`${basePath}/${encodeURIComponent(payload.id)}`);
        router.refresh();
      } else {
        await load();
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return <div className="p-4 sm:p-6 lg:p-8"><LiveDataState loading={loading} error={error} onRetry={load} /></div>;
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <section className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href={basePath} className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1" /> Back to Shop the Look
            </Link>
            <p className="kicker mt-5 text-[var(--muted)]">{lookId ? "Edit curated look" : "New curated look"}</p>
            <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em] sm:text-4xl">{form.title || "Create a look"}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {lookId && form.slug && form.active && (
              <Link
                href={`/shop-by-look/${form.slug}`}
                target="_blank"
                className="group inline-flex min-h-11 items-center gap-2 rounded-full border hairline px-4 text-[10px] font-semibold uppercase tracking-[0.08em]"
              >
                Preview <ArrowUpRight size={14} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--deep-green)] px-5 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50"
            >
              <Check size={14} /> {saving ? "Saving…" : "Save look"}
            </button>
          </div>
        </div>
        {message && <p className="mt-4 text-xs text-[var(--muted)]">{message}</p>}
      </section>

      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] lg:p-8">
        <div className="space-y-5">
          <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <p className="kicker text-[var(--muted)]">Look details</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Look name *</span>
                <input
                  value={form.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setForm((current) => ({
                      ...current,
                      title,
                      slug: slugTouched ? current.slug : toSlug(title),
                    }));
                  }}
                  className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none focus:border-[var(--deep-green)]"
                  placeholder="Warm minimalist living room"
                />
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Slug *</span>
                <input
                  value={form.slug}
                  onChange={(event) => { setSlugTouched(true); setField("slug", toSlug(event.target.value)); }}
                  className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none focus:border-[var(--deep-green)]"
                  placeholder="warm-minimalist-living-room"
                />
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Small heading</span>
                <input
                  value={form.eyebrow}
                  onChange={(event) => setField("eyebrow", event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none focus:border-[var(--deep-green)]"
                  placeholder="Living room edit"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Description *</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setField("description", event.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-lg border hairline bg-transparent px-4 py-3 text-sm leading-6 outline-none focus:border-[var(--deep-green)]"
                  placeholder="Describe how the pieces work together and the feeling of the room."
                />
              </label>
              <div className="sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Look image</span>
                <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">Upload the main lifestyle image customers should see for this Shop the Look. JPG, PNG, WebP and other image formats are supported up to 12 MB.</span>
                <label className="mt-3 flex min-h-28 cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed hairline bg-[var(--paper-2)] px-4 text-center transition hover:border-[var(--deep-green)]">
                  <ImagePlus size={20} className="text-[var(--deep-green)]" />
                  <span className="text-xs">{heroImageFile ? heroImageFile.name : existingHeroImageUrl ? "Choose a replacement look image" : "Choose look image"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => setHeroImageFile(event.target.files?.[0] || null)}
                  />
                </label>
                {heroImageFile && (
                  <button type="button" onClick={() => setHeroImageFile(null)} className="mt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] underline underline-offset-4">Use existing image instead</button>
                )}
              </div>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Room / space</span>
                <select value={form.spaceId} onChange={(event) => setField("spaceId", event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none">
                  <option value="">Not specified</option>
                  {data.spaces.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
                </select>
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Style</span>
                <select value={form.styleId} onChange={(event) => setField("styleId", event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none">
                  <option value="">Not specified</option>
                  {data.styles.map((item) => <option key={item._id} value={item._id}>{item.title}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="kicker text-[var(--muted)]">Products</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Build the complete look</h2>
              </div>
              <div className="relative w-full sm:max-w-xs">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-10 w-full rounded-full border hairline bg-transparent pl-9 pr-4 text-xs outline-none" placeholder="Search product or SKU" />
              </div>
            </div>

            <div className="mt-5 max-h-64 overflow-y-auto rounded-lg border hairline">
              {availableProducts.length ? availableProducts.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addProduct(product._id)}
                  className="flex w-full items-center gap-3 border-b hairline p-3 text-left transition last:border-b-0 hover:bg-[var(--paper-2)]"
                >
                  <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-[var(--paper-2)]">
                    {product.image ? <Image src={product.image} alt={product.name || "Product"} fill unoptimized className="object-cover" /> : <div className="grid h-full place-items-center"><Layers3 size={16} className="text-[var(--muted)]" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{product.name || "Untitled product"}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{product.sku || "NO-SKU"} · {formatMoney(Number(product.price || 0))}</p>
                  </div>
                  <Plus size={15} className="shrink-0 text-[var(--deep-green)]" />
                </button>
              )) : <p className="p-5 text-xs text-[var(--muted)]">No matching products.</p>}
            </div>

            <div className="mt-5 space-y-3">
              {form.products.length === 0 ? (
                <div className="rounded-lg bg-[var(--paper-2)] p-5 text-sm text-[var(--muted)]">No products selected yet.</div>
              ) : form.products.map((line, index) => {
                const product = productMap.get(line.productId);
                if (!product) return null;
                return (
                  <div key={line.productId} className="grid gap-3 rounded-lg border hairline p-3 sm:grid-cols-[56px_minmax(0,1fr)_90px_auto] sm:items-center">
                    <div className="relative size-14 overflow-hidden rounded-md bg-[var(--paper-2)]">
                      {product.image ? <Image src={product.image} alt={product.name || "Product"} fill unoptimized className="object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-[var(--muted)]">#{index + 1}</span>
                        <p className="truncate text-xs font-semibold">{product.name}</p>
                      </div>
                      <input
                        value={line.note}
                        onChange={(event) => updateProduct(line.productId, { note: event.target.value })}
                        className="mt-2 min-h-9 w-full rounded-md border hairline bg-transparent px-3 text-[11px] outline-none"
                        placeholder="Styling note (optional)"
                      />
                    </div>
                    <label>
                      <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Qty</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={line.quantity}
                        onChange={(event) => updateProduct(line.productId, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                        className="mt-1 min-h-9 w-full rounded-md border hairline bg-transparent px-3 text-xs outline-none"
                      />
                    </label>
                    <button type="button" onClick={() => removeProduct(line.productId)} className="grid size-9 place-items-center rounded-full border hairline text-[var(--muted)] hover:text-red-700" aria-label={`Remove ${product.name}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <section className="overflow-hidden rounded-xl border hairline bg-[var(--paper)]">
            <div className="relative aspect-[4/3] bg-[var(--warm-beige)]">
              {previewImage ? (
                <Image src={previewImage} alt="Look preview" fill unoptimized className="object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[var(--deep-green)]"><Layers3 size={42} strokeWidth={1.1} /></div>
              )}
            </div>
            <div className="p-5">
              <p className="kicker text-[var(--muted)]">Customer preview</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{form.title || "Untitled look"}</h2>
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-[var(--muted)]">{form.description || "Your look description will appear here."}</p>
              <div className="mt-5 grid grid-cols-2 border-t hairline pt-4 text-xs">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Products</p>
                  <p className="mt-1 font-semibold">{form.products.length}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--muted)]">Look total</p>
                  <p className="mt-1 font-semibold">{formatMoney(totalPrice)}</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-[var(--paper-2)] p-3 text-[10px] leading-5 text-[var(--muted)]">
                The uploaded Look Image is used first. If no Look Image is supplied, the first selected product image is used automatically.
              </p>
            </div>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">Publishing</p>
            <div className="mt-4 space-y-4">
              <label className="flex items-start justify-between gap-4 rounded-lg border hairline p-4">
                <div>
                  <p className="text-xs font-semibold">Live on customer site</p>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Turn off to keep the look hidden while editing.</p>
                </div>
                <input type="checkbox" checked={form.active} onChange={(event) => setField("active", event.target.checked)} />
              </label>
              <label className="flex items-start justify-between gap-4 rounded-lg border hairline p-4">
                <div>
                  <p className="text-xs font-semibold">Featured look</p>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Featured look is promoted on the homepage. Only one is kept featured.</p>
                </div>
                <input type="checkbox" checked={form.featured} onChange={(event) => setField("featured", event.target.checked)} />
              </label>
              <label>
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Display order</span>
                <input type="number" min={0} value={form.displayOrder} onChange={(event) => setField("displayOrder", Math.max(0, Number(event.target.value) || 0))} className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none" />
              </label>
            </div>
          </section>

          <section className="rounded-xl border hairline bg-[var(--paper)] p-5">
            <p className="kicker text-[var(--muted)]">SEO</p>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">SEO title</span>
                <input value={form.seoTitle} onChange={(event) => setField("seoTitle", event.target.value.slice(0, 70))} className="mt-2 min-h-11 w-full rounded-lg border hairline bg-transparent px-4 text-sm outline-none" placeholder="Defaults to look name" />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">SEO description</span>
                <textarea value={form.seoDescription} onChange={(event) => setField("seoDescription", event.target.value.slice(0, 180))} rows={3} className="mt-2 w-full rounded-lg border hairline bg-transparent px-4 py-3 text-sm outline-none" placeholder="Defaults to look description" />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
