"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { FolderTree, ImagePlus, LoaderCircle, Plus, Save } from "lucide-react";

type Stage = "PRODUCTION" | "PACKAGING" | "DELIVERY";
type Category = {
  _id: string;
  title: string;
  slug: string;
  description?: string;
  displayOrder?: number;
  showInNavigation?: boolean;
  active?: boolean;
  imageUrl?: string;
  parentId?: string;
  parentTitle?: string;
  fulfilmentStages?: Stage[];
};

type Editor = {
  title: string; slug: string; description: string; parentId: string; displayOrder: string;
  showInNavigation: boolean; active: boolean; fulfilmentStages: Stage[];
};
const blank: Editor = { title: "", slug: "", description: "", parentId: "", displayOrder: "100", showInNavigation: true, active: true, fulfilmentStages: [] };
const stageLabels: Record<Stage, string> = { PRODUCTION: "Production", PACKAGING: "Packaging", DELIVERY: "Delivery" };

function fromCategory(category: Category): Editor {
  return { title: category.title, slug: category.slug || "", description: category.description || "", parentId: category.parentId || "", displayOrder: String(category.displayOrder ?? 100), showInNavigation: category.showInNavigation !== false, active: category.active !== false, fulfilmentStages: category.fulfilmentStages || [] };
}

export default function CategoryManagerPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor>(blank);
  const [image, setImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selected = useMemo(() => categories.find((item) => item._id === selectedId), [categories, selectedId]);

  async function load() {
    const response = await fetch("/api/backoffice/categories", { cache: "no-store" });
    const payload = await response.json() as { categories?: Category[]; message?: string };
    if (!response.ok) throw new Error(payload.message || "Unable to load categories.");
    setCategories(payload.categories || []);
  }
  useEffect(() => { void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load categories.")).finally(() => setLoading(false)); }, []);

  function choose(category?: Category) {
    setSelectedId(category?._id || "");
    setEditor(category ? fromCategory(category) : blank);
    setImage(null);
    setMessage("");
  }
  function toggleStage(stage: Stage) {
    setEditor((current) => ({ ...current, fulfilmentStages: current.fulfilmentStages.includes(stage) ? current.fulfilmentStages.filter((item) => item !== stage) : [...current.fulfilmentStages, stage] }));
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    try {
      const form = new FormData();
      form.set("payload", JSON.stringify({ ...editor, displayOrder: Number(editor.displayOrder || 100) }));
      if (image) form.set("image", image);
      const response = await fetch(selectedId ? `/api/backoffice/categories/${selectedId}` : "/api/backoffice/categories", { method: selectedId ? "PATCH" : "POST", body: form });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Unable to save category.");
      await load(); setMessage(selectedId ? "Category updated." : "Category created."); if (!selectedId) choose();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to save category."); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-full bg-[var(--paper-2)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto grid w-full max-w-[1500px] items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-5 xl:flex xl:max-h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="kicker text-[var(--muted)]">Catalogue</p><h1 className="mt-2 text-2xl font-semibold">Categories</h1></div>
            <button onClick={() => choose()} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--brand-green)] px-4 py-2 text-xs font-semibold text-white"><Plus size={14}/>New category</button>
          </div>
          <div className="mt-5 space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">{loading ? <LoaderCircle className="animate-spin"/> : categories.map((category) => (
            <button key={category._id} onClick={() => choose(category)} className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left ${selectedId === category._id ? "border-[var(--brand-green)] bg-[var(--brand-green)]/5" : "hairline bg-[var(--paper)]"}`}>
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-white">{category.imageUrl ? <Image src={category.imageUrl} alt="" fill unoptimized className="object-cover"/> : <div className="grid h-full place-items-center"><FolderTree size={18}/></div>}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{category.title}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{category.parentTitle ? `Subcategory of ${category.parentTitle}` : "Top-level category"}{category.active === false ? " · Inactive" : ""}</p></div>
            </button>
          ))}</div>
        </section>

        <form onSubmit={save} className="min-w-0 rounded-2xl border hairline bg-white p-4 sm:p-6 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:overscroll-contain">
          <div className="flex items-start gap-2"><ImagePlus size={18} className="mt-0.5 shrink-0"/><h2 className="break-words text-base font-semibold sm:text-lg">{selected ? `Edit ${selected.title}` : "Create category / subcategory"}</h2></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Category name<input required value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Slug<input value={editor.slug} onChange={(event) => setEditor({ ...editor, slug: event.target.value })} placeholder="Auto-generated when blank" className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold md:col-span-2">Parent category<select value={editor.parentId} onChange={(event) => setEditor({ ...editor, parentId: event.target.value })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"><option value="">Top-level category</option>{categories.filter((category) => category._id !== selectedId).map((category) => <option key={category._id} value={category._id}>{category.title}</option>)}</select></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold md:col-span-2">Description<textarea rows={3} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} className="min-w-0 resize-y rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Display order<input type="number" min="0" value={editor.displayOrder} onChange={(event) => setEditor({ ...editor, displayOrder: event.target.value })} className="min-w-0 rounded-lg border hairline px-3 py-3 font-normal"/></label>
            <label className="grid min-w-0 gap-2 text-xs font-semibold">Category image<input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} className="min-w-0 max-w-full rounded-lg border hairline px-3 py-2 font-normal file:mr-2 file:max-w-[120px] file:truncate"/></label>
          </div>
          <div className="mt-6 rounded-xl border hairline bg-[var(--paper)] p-4">
            <p className="text-xs font-semibold">Fulfilment stages after sale</p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Select only the stages products in this category require. The first selected stage starts automatically after payment; a manager assigns its first staff member.</p>
            <div className="mt-3 grid gap-2 min-[420px]:grid-cols-3">{(["PRODUCTION", "PACKAGING", "DELIVERY"] as Stage[]).map((stage) => <label key={stage} className="inline-flex min-h-10 items-center gap-2 rounded-lg border hairline bg-white px-3 text-xs"><input type="checkbox" checked={editor.fulfilmentStages.includes(stage)} onChange={() => toggleStage(stage)}/>{stageLabels[stage]}</label>)}</div>
          </div>
          <div className="mt-5 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap"><label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={editor.showInNavigation} onChange={(event) => setEditor({ ...editor, showInNavigation: event.target.checked })}/>Show in navigation</label><label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={editor.active} onChange={(event) => setEditor({ ...editor, active: event.target.checked })}/>Active</label></div>
          {message && <p className="mt-5 break-words rounded-lg bg-[var(--paper)] p-3 text-xs">{message}</p>}
          <button disabled={saving} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-green)] px-5 py-3 text-xs font-semibold text-white disabled:opacity-50 sm:w-auto">{saving ? <LoaderCircle size={14} className="animate-spin"/> : <Save size={14}/>} {selected ? "Save category changes" : "Create category"}</button>
        </form>
      </div>
    </div>
  );
}
