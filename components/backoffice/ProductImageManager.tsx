"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

type ImageSummary = { _key: string; url?: string };
type ImagesProduct = {
  _rev: string;
  heroImage?: { url?: string } | null;
  gallery?: ImageSummary[];
  variants?: Array<{ _key?: string; title?: string; colour?: string; size?: string; sku?: string; imageUrl?: string }>;
};

export default function ProductImageManager({ productId, onRemoved }: { productId: string; onRemoved?: () => void }) {
  const [product, setProduct] = useState<ImagesProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/backoffice/products/${encodeURIComponent(productId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { product?: ImagesProduct; message?: string };
        if (!response.ok || !result.product) throw new Error(result.message || "Unable to load product images.");
        if (active) setProduct(result.product);
      }).catch((cause) => { if (active) setMessage(cause instanceof Error ? cause.message : "Unable to load images."); });
    return () => { active = false; };
  }, [productId]);

  async function remove(kind: "hero" | "gallery" | "variant", key?: string) {
    if (busy || !product?._rev || !window.confirm("Remove this product image? The original Sanity asset is retained.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/backoffice/products/${encodeURIComponent(productId)}/images`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, key, expectedRevision: product._rev }),
      });
      const result = (await response.json()) as { revision?: string; message?: string };
      if (!response.ok || !result.revision) throw new Error(result.message || "Unable to remove image.");
      setProduct((current) => current ? {
        ...current, _rev: result.revision!,
        ...(kind === "hero" ? { heroImage: null } : {}),
        ...(kind === "gallery" ? { gallery: (current.gallery || []).filter((image) => image._key !== key) } : {}),
        ...(kind === "variant" ? { variants: (current.variants || []).map((variant) => variant._key === key ? { ...variant, imageUrl: undefined } : variant) } : {}),
      } : current);
      onRemoved?.();
      setMessage("Image removed from the product.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to remove image.");
    } finally {
      setBusy(false);
    }
  }

  if (!product && !message) return <p className="p-4 text-xs text-[var(--muted)]">Loading product images…</p>;
  return <section className="mx-4 mt-4 rounded-xl border hairline bg-[var(--paper)] p-4 sm:mx-6 lg:mx-8" aria-label="Manage product images">
    <h2 className="text-sm font-semibold">Product images</h2>
    <p className="mt-1 text-xs text-[var(--muted)]">Store Manager can remove hero, gallery and variant images. Removing a reference does not delete the original Sanity asset.</p>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    {product && <div className="mt-4 flex flex-wrap gap-4">
      {product.heroImage?.url && <div className="space-y-2"><img src={product.heroImage.url} alt="Hero" className="size-24 rounded-lg border object-cover"/><button type="button" disabled={busy} onClick={() => void remove("hero")} className="flex items-center gap-1 rounded-full border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"><Trash2 size={12}/>Remove hero</button></div>}
      {(product.gallery || []).map((image, index) => <div key={image._key} className="space-y-2">{image.url && <img src={image.url} alt={`Gallery ${index+1}`} className="size-24 rounded-lg border object-cover"/>}<button type="button" disabled={busy} onClick={() => void remove("gallery", image._key)} className="flex items-center gap-1 rounded-full border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"><Trash2 size={12}/>Remove gallery {index+1}</button></div>)}
      {(product.variants || []).filter((variant) => variant.imageUrl && variant._key).map((variant) => <div key={variant._key} className="space-y-2"><img src={variant.imageUrl} alt={variant.title || "Variant"} className="size-24 rounded-lg border object-cover"/><button type="button" disabled={busy} onClick={() => void remove("variant", variant._key)} className="flex items-center gap-1 rounded-full border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"><Trash2 size={12}/>Remove {variant.title || variant.sku || "variant"}</button></div>)}
    </div>}
  </section>;
}
