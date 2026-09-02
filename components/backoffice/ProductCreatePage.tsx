"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";

type Option = { _id: string; title: string; slug?: string };
type OptionsPayload = { categories: Option[]; collections: Option[]; spaces: Option[]; styles: Option[] };
type ExistingGalleryImage = { _key: string; assetRef: string; url?: string };
type VariantDraft = {
  _key?: string;
  title: string;
  colour: string;
  size: string;
  sku: string;
  price: string;
  stockQuantity: string;
  existingImageAssetRef?: string;
  imageUrl?: string;
  image?: File;
};
type EditorProduct = {
  _id: string;
  name?: string;
  price?: number;
  procurementCost?: number;
  compareAtPrice?: number;
  rating?: number;
  reviewCount?: number;
  primaryCategory?: string;
  categories?: string[];
  collections?: string[];
  spaces?: string[];
  styles?: string[];
  heroImage?: { assetRef?: string; url?: string } | null;
  gallery?: ExistingGalleryImage[];
  shortDescription?: string;
  description?: string;
  colours?: string[];
  variants?: Array<{
    _key?: string;
    title?: string;
    colour?: string;
    size?: string;
    sku?: string;
    price?: number;
    stockQuantity?: number;
    imageAssetRef?: string;
    imageUrl?: string;
  }>;
  materials?: string[];
  dimensions?: string;
  careInstructions?: string;
  initialStock?: number;
  ecommerceEnabled?: boolean;
  posEnabled?: boolean;
  featured?: boolean;
  newArrival?: boolean;
  bestSeller?: boolean;
  onSale?: boolean;
  available?: boolean;
  inventory?: { location?: string; reserved?: number; incoming?: number; reorderPoint?: number; unitCost?: number } | null;
};

const blankVariant = (): VariantDraft => ({ title: "", colour: "", size: "", sku: "", price: "", stockQuantity: "" });

export default function ProductCreatePage({ productId }: { productId?: string }) {
  const router = useRouter();
  const isEditing = Boolean(productId);
  const [options, setOptions] = useState<OptionsPayload>({ categories: [], collections: [], spaces: [], styles: [] });
  const [product, setProduct] = useState<EditorProduct | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [existingGallery, setExistingGallery] = useState<ExistingGalleryImage[]>([]);
  const [salesChannels, setSalesChannels] = useState({ ecommerce: true, pos: true });
  const [visibility, setVisibility] = useState({ available: true, featured: false, newArrival: false, bestSeller: false, onSale: false });
  const [selected, setSelected] = useState({ categories: [] as string[], collections: [] as string[], spaces: [] as string[], styles: [] as string[] });

  useEffect(() => {
    void fetch("/api/backoffice/products", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as OptionsPayload & { message?: string };
        if (!response.ok) throw new Error(payload.message || "Unable to load product options.");
        setOptions(payload);
      })
      .catch((cause) => setMessage(cause instanceof Error ? cause.message : "Unable to load product options."))
      .finally(() => setLoadingOptions(false));
  }, []);

  useEffect(() => {
    if (!productId) return;
    void fetch(`/api/backoffice/products/${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { product?: EditorProduct; message?: string };
        if (!response.ok || !payload.product) throw new Error(payload.message || "Unable to load product.");
        const next = payload.product;
        setProduct(next);
        setSelected({
          categories: next.categories || [],
          collections: next.collections || [],
          spaces: next.spaces || [],
          styles: next.styles || [],
        });
        setSalesChannels({ ecommerce: next.ecommerceEnabled !== false, pos: next.posEnabled !== false });
        setVisibility({
          available: next.available !== false,
          featured: next.featured === true,
          newArrival: next.newArrival === true,
          bestSeller: next.bestSeller === true,
          onSale: next.onSale === true,
        });
        setExistingGallery(next.gallery || []);
        setVariants((next.variants || []).map((variant) => ({
          _key: variant._key,
          title: variant.title || "",
          colour: variant.colour || "",
          size: variant.size || "",
          sku: variant.sku || "",
          price: typeof variant.price === "number" ? String(variant.price) : "",
          stockQuantity: typeof variant.stockQuantity === "number" ? String(variant.stockQuantity) : "",
          existingImageAssetRef: variant.imageAssetRef,
          imageUrl: variant.imageUrl,
        })));
      })
      .catch((cause) => setMessage(cause instanceof Error ? cause.message : "Unable to load product."))
      .finally(() => setLoadingProduct(false));
  }, [productId]);

  function toggle(group: keyof typeof selected, id: string) {
    setSelected((current) => ({
      ...current,
      [group]: current[group].includes(id) ? current[group].filter((value) => value !== id) : [...current[group], id],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    form.set("categories", JSON.stringify(selected.categories));
    form.set("collections", JSON.stringify(selected.collections));
    form.set("spaces", JSON.stringify(selected.spaces));
    form.set("styles", JSON.stringify(selected.styles));
    form.set("galleryExisting", JSON.stringify(existingGallery.map((image) => ({ key: image._key, assetRef: image.assetRef }))));

    if (!salesChannels.ecommerce && !salesChannels.pos) {
      setMessage("Select at least one sales channel: E-commerce or POS.");
      setSaving(false);
      return;
    }
    form.set("ecommerceEnabled", String(salesChannels.ecommerce));
    form.set("posEnabled", String(salesChannels.pos));
    for (const [key, value] of Object.entries(visibility)) form.set(key, String(value));

    form.set("variants", JSON.stringify(variants.map(({ image: _image, imageUrl: _imageUrl, ...variant }) => ({
      ...variant,
      price: variant.price ? Number(variant.price) : null,
      stockQuantity: variant.stockQuantity !== "" ? Number(variant.stockQuantity) : null,
    }))));
    variants.forEach((variant, index) => {
      if (variant.image) form.set(`variantImage-${index}`, variant.image);
    });

    try {
      const endpoint = isEditing && productId ? `/api/backoffice/products/${encodeURIComponent(productId)}` : "/api/backoffice/products";
      const response = await fetch(endpoint, { method: isEditing ? "PATCH" : "POST", body: form });
      const payload = await response.json() as { message?: string; productId?: string };
      if (!response.ok) throw new Error(payload.message || `Unable to ${isEditing ? "update" : "create"} product.`);
      const destinationId = productId || payload.productId;
      if (!destinationId) throw new Error("Product saved but its ID was not returned.");
      router.push(`/admin/products/${encodeURIComponent(destinationId)}`);
      router.refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : `Unable to ${isEditing ? "update" : "create"} product.`);
      setSaving(false);
    }
  }

  if (loadingProduct || (isEditing && loadingOptions)) {
    return <div className="grid min-h-[50vh] place-items-center bg-[var(--paper-2)]"><div className="flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin"/>Loading product editor…</div></div>;
  }

  if (isEditing && !product) {
    return <div className="p-8"><Link href="/admin/products" className="text-sm underline">Back to products</Link><p className="mt-6 text-sm text-red-700">{message || "Product could not be loaded."}</p></div>;
  }

  const inventory = product?.inventory;

  return (
    <div className="min-h-full bg-[var(--paper-2)]">
      <header className="border-b hairline bg-[var(--paper)] px-4 py-6 sm:px-6 lg:px-10">
        <Link href={isEditing && productId ? `/admin/products/${encodeURIComponent(productId)}` : "/admin/products"} className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]"><ArrowLeft size={13} className="transition-transform group-hover:-translate-x-1"/>{isEditing ? "Back to product" : "Back to products"}</Link>
        <p className="kicker mt-5 text-[var(--muted)]">Product catalogue</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.04em]">{isEditing ? `Edit ${product?.name || "product"}` : "Add a new product"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{isEditing ? "Every catalogue section available during product creation can be updated here." : "Create the same core catalogue information used by Sanity without leaving the Decor by Kasiwa Admin Office. The product is saved directly to the live Sanity catalogue."}</p>
      </header>

      <form onSubmit={submit} className="mx-auto grid max-w-[1500px] gap-5 p-4 sm:p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
        <div className="space-y-5">
          <Card title="Product details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name *" className="sm:col-span-2"><input name="name" defaultValue={product?.name || ""} required /></Field>
              <Field label="Price (KES) *"><input name="price" type="number" min="1" step="0.01" defaultValue={product?.price ?? ""} required /></Field>
              <Field label="Compare-at price"><input name="compareAtPrice" type="number" min="0" step="0.01" defaultValue={product?.compareAtPrice ?? ""} /></Field>
              <Field label="Primary category *" className="sm:col-span-2"><select name="primaryCategory" required disabled={loadingOptions} defaultValue={product?.primaryCategory || ""}><option value="">Select category</option>{options.categories.map((item)=><option key={item._id} value={item._id}>{item.title}</option>)}</select></Field>
              <Field label="Short description" className="sm:col-span-2"><textarea name="shortDescription" rows={3} defaultValue={product?.shortDescription || ""}/></Field>
              <Field label="Full description" className="sm:col-span-2"><textarea name="description" rows={6} defaultValue={product?.description || ""}/></Field>
            </div>
          </Card>

          <Card title="Images">
            {product?.heroImage?.url && <div className="mb-4"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Current hero image</p><img src={product.heroImage.url} alt="Current product hero" className="h-36 w-36 rounded-xl border hairline object-cover" /></div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <FileField label={isEditing ? "Replace hero image" : "Hero image"} name="heroImage" />
              <FileField label={isEditing ? "Add gallery images" : "Gallery images"} name="galleryImages" multiple />
            </div>
            {isEditing && existingGallery.length > 0 && <div className="mt-5"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">Current gallery</p><div className="flex flex-wrap gap-3">{existingGallery.map((image, index)=><div key={image._key} className="relative"><div className="h-24 w-24 overflow-hidden rounded-xl border hairline bg-[var(--paper-2)]">{image.url ? <img src={image.url} alt={`Gallery ${index+1}`} className="h-full w-full object-cover"/> : null}</div><button type="button" onClick={()=>setExistingGallery((current)=>current.filter((item)=>item._key!==image._key))} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full border bg-[var(--paper)] shadow" aria-label={`Remove gallery image ${index+1}`}><Trash2 size={12}/></button></div>)}</div></div>}
          </Card>

          <Card title="Product details & care">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Colours" hint="Comma or new-line separated"><textarea name="colours" rows={3} defaultValue={(product?.colours || []).join(", ")}/></Field>
              <Field label="Materials / finishes" hint="Comma or new-line separated"><textarea name="materials" rows={3} defaultValue={(product?.materials || []).join(", ")}/></Field>
              <Field label="Dimensions"><input name="dimensions" defaultValue={product?.dimensions || ""} /></Field>
              <Field label="Care instructions"><textarea name="careInstructions" rows={3} defaultValue={product?.careInstructions || ""}/></Field>
            </div>
          </Card>

          <Card title="Variants" action={<button type="button" onClick={()=>setVariants((current)=>[...current,blankVariant()])} className="inline-flex items-center gap-2 rounded-full border hairline px-3 py-2 text-[9px] font-semibold uppercase"><Plus size={12}/>Add variant</button>}>
            {variants.length === 0 ? <p className="text-sm text-[var(--muted)]">No variants. The product will use its main price and stock.</p> : <div className="space-y-3">{variants.map((variant,index)=><div key={variant._key || index} className="rounded-xl border hairline bg-[var(--paper-2)] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold">Variant {index+1}</p><button type="button" onClick={()=>setVariants((current)=>current.filter((_,i)=>i!==index))} aria-label={`Remove variant ${index+1}`}><Trash2 size={14}/></button></div>{variant.imageUrl && !variant.image && <img src={variant.imageUrl} alt="Current variant" className="mb-3 h-20 w-20 rounded-lg border hairline object-cover"/>}<div className="grid gap-3 sm:grid-cols-3">{(["title","colour","size","sku","price","stockQuantity"] as const).map((key)=><Field key={key} label={key === "stockQuantity" ? "Stock" : key[0].toUpperCase()+key.slice(1)}><input type={["price","stockQuantity"].includes(key)?"number":"text"} min={["price","stockQuantity"].includes(key)?0:undefined} value={variant[key]} onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,[key]:e.target.value}:item))}/></Field>)}</div><label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">{variant.imageUrl ? "Replace variant image" : "Variant image"}<input type="file" accept="image/*" onChange={(e)=>setVariants((current)=>current.map((item,i)=>i===index?{...item,image:e.target.files?.[0]}:item))} className="mt-2 block w-full text-xs normal-case tracking-normal"/></label></div>)}</div>}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Inventory">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="Initial stock"><input name="initialStock" type="number" min="0" defaultValue={product?.initialStock ?? 0} /></Field>
              <Field label="Incoming"><input name="incoming" type="number" min="0" defaultValue={inventory?.incoming ?? 0} /></Field>
              <Field label="Reorder level"><input name="reorderPoint" type="number" min="0" defaultValue={inventory?.reorderPoint ?? 5} /></Field>
              <Field label="Procurement cost (KES)" hint="Initial cost used for profit & loss"><input name="procurementCost" type="number" min="0" step="0.01" defaultValue={product?.procurementCost ?? inventory?.unitCost ?? 0} /></Field>
              <Field label="Inventory location" className="sm:col-span-2 lg:col-span-1 xl:col-span-2"><input name="location" defaultValue={inventory?.location || "Main store"} /></Field>
            </div>
          </Card>

          <Card title="Merchandising">
            <OptionGroup title="Additional categories" items={options.categories} selected={selected.categories} onToggle={(id)=>toggle("categories",id)} />
            <OptionGroup title="Collections" items={options.collections} selected={selected.collections} onToggle={(id)=>toggle("collections",id)} />
            <OptionGroup title="Shop by Space" items={options.spaces} selected={selected.spaces} onToggle={(id)=>toggle("spaces",id)} />
            <OptionGroup title="Shop by Style" items={options.styles} selected={selected.styles} onToggle={(id)=>toggle("styles",id)} />
          </Card>

          <Card title="Sales channels">
            <p className="mb-4 text-xs leading-5 text-[var(--muted)]">Choose where this product can be sold. Keep both enabled to sell it online and at the POS.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <ChannelToggle label="E-commerce" description="Customer-facing online shop" checked={salesChannels.ecommerce} onChange={(checked) => setSalesChannels((current) => ({ ...current, ecommerce: checked }))} />
              <ChannelToggle label="Point of Sale" description="Admin/store POS only" checked={salesChannels.pos} onChange={(checked) => setSalesChannels((current) => ({ ...current, pos: checked }))} />
            </div>
          </Card>

          <Card title="Visibility">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <VisibilityToggle label="Available in shop" checked={visibility.available} onChange={(checked)=>setVisibility((current)=>({...current,available:checked}))}/>
              <VisibilityToggle label="Featured" checked={visibility.featured} onChange={(checked)=>setVisibility((current)=>({...current,featured:checked}))}/>
              <VisibilityToggle label="New arrival" checked={visibility.newArrival} onChange={(checked)=>setVisibility((current)=>({...current,newArrival:checked}))}/>
              <VisibilityToggle label="Best seller" checked={visibility.bestSeller} onChange={(checked)=>setVisibility((current)=>({...current,bestSeller:checked}))}/>
              <VisibilityToggle label="On sale" checked={visibility.onSale} onChange={(checked)=>setVisibility((current)=>({...current,onSale:checked}))}/>
            </div>
          </Card>

          <Card title="Social proof (optional)">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><Field label="Display rating (4.0–4.8)"><input name="rating" type="number" min="4" max="4.8" step="0.1" defaultValue={product?.rating ?? ""} /></Field><Field label="Review count"><input name="reviewCount" type="number" min="0" step="1" defaultValue={product?.reviewCount ?? ""} /></Field></div>
          </Card>

          {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">{message}</p>}
          <button type="submit" disabled={saving || loadingOptions} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--deep-green)] px-6 text-[10px] font-semibold uppercase tracking-[0.08em] !text-soft-cream disabled:opacity-50"><Save size={14}/>{saving ? (isEditing ? "Saving product…" : "Creating product…") : (isEditing ? "Save all product changes" : "Create product")}</button>
        </div>
      </form>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-2xl border hairline bg-[var(--paper)] p-5 sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>{action}</div>{children}</section>; }
function Field({ label, hint, className="", children }: { label: string; hint?: string; className?: string; children: ReactNode }) { return <label className={`block ${className}`}><span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">{label}</span>{hint&&<span className="ml-2 text-[9px] text-[var(--muted)]">{hint}</span>}<div className="mt-2 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:px-3 [&_input]:text-sm [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:bg-[var(--paper)] [&_select]:px-3 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:p-3 [&_textarea]:text-sm">{children}</div></label>; }
function FileField({ label, name, multiple=false }: { label: string; name: string; multiple?: boolean }) { return <label className="block rounded-xl border border-dashed hairline bg-[var(--paper-2)] p-4"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]"><ImagePlus size={14}/>{label}</span><input type="file" name={name} accept="image/*" multiple={multiple} className="mt-3 block w-full text-xs"/></label>; }
function VisibilityToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked:boolean)=>void }) { return <label className="flex min-h-11 items-center gap-3 rounded-xl border hairline p-3 text-xs font-medium"><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)} className="size-4 accent-[var(--deep-green)]"/>{label}</label>; }
function OptionGroup({ title, items, selected, onToggle }: { title: string; items: Option[]; selected: string[]; onToggle: (id:string)=>void }) { if(!items.length) return null; return <div className="mb-5 last:mb-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--muted)]">{title}</p><div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border hairline p-3">{items.map((item)=><button key={item._id} type="button" onClick={()=>onToggle(item._id)} className={`rounded-full border px-3 py-2 text-[9px] font-semibold ${selected.includes(item._id)?"border-[var(--deep-green)] bg-[var(--deep-green)] !text-soft-cream":"hairline bg-[var(--paper)]"}`}>{item.title}</button>)}</div></div>; }

function ChannelToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-16 items-center justify-between gap-4 rounded-xl border hairline p-3 text-left">
    <span><span className="block text-xs font-semibold">{label}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{description}</span></span>
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-[var(--deep-green)]" : "bg-black/15"}`}><span className={`absolute top-1 size-4 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`} /></span>
  </button>;
}
