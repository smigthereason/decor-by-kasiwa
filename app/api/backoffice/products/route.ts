import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { generateProductSku } from "@/sanity/lib/sku";
import { serverClient } from "@/sanity/lib/serverClient";

export const dynamic = "force-dynamic";

type ReferenceOption = { _id: string; title: string; slug?: string };
type VariantInput = {
  title?: string;
  colour?: string;
  size?: string;
  sku?: string;
  price?: number | null;
  stockQuantity?: number | null;
};

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const number = Number(clean(value));
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  return ["true", "1", "on", "yes"].includes(clean(value).toLowerCase());
}

function jsonArray(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch {
    return [] as string[];
  }
}

function textList(value: FormDataEntryValue | null) {
  return clean(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

function references(ids: string[]) {
  return ids.map((id) => ({ _key: randomUUID().slice(0, 12), _type: "reference", _ref: id }));
}

function inventoryDocumentId(productId: string) {
  return `inventory.${productId.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
}

async function uploadImage(file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "Upload"} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);
  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `product-${Date.now()}`,
    contentType: file.type || undefined,
  });
  return { _type: "image", asset: { _type: "reference", _ref: asset._id } };
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  const exists = await serverClient.fetch<boolean>(`count(*[_type == "product" && slug.current == $slug]) > 0`, { slug: base });
  return exists ? `${base}-${randomUUID().slice(0, 6).toLowerCase()}` : base;
}

export async function GET() {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const [categories, collections, spaces, styles] = await Promise.all([
    serverClient.fetch<ReferenceOption[]>(`*[_type == "category"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "collection"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "shopSpace"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
    serverClient.fetch<ReferenceOption[]>(`*[_type == "shopStyle"] | order(title asc){_id,title,"slug":slug.current}`, {}, { cache: "no-store" }),
  ]);

  return NextResponse.json({ categories, collections, spaces, styles });
}

export async function POST(request: Request) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  try {
    const form = await request.formData();
    const name = clean(form.get("name"));
    const price = numberValue(form.get("price"));
    const primaryCategory = clean(form.get("primaryCategory"));

    if (!name) return NextResponse.json({ message: "Product name is required." }, { status: 400 });
    if (!(price > 0)) return NextResponse.json({ message: "Price must be greater than zero." }, { status: 400 });
    if (!primaryCategory) return NextResponse.json({ message: "Primary category is required." }, { status: 400 });

    const productId = `product.${randomUUID().replaceAll("-", "")}`;
    const slug = await uniqueSlug(name);
    const sku = generateProductSku(name, productId);
    const now = new Date().toISOString();
    const heroImage = await uploadImage(form.get("heroImage") instanceof File ? form.get("heroImage") as File : null);
    const galleryFiles = form.getAll("galleryImages").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const gallery = (await Promise.all(galleryFiles.map((file) => uploadImage(file))))
      .filter((image): image is NonNullable<typeof image> => Boolean(image))
      .map((image) => ({ ...image, _key: randomUUID().slice(0, 12) }));

    let variants: VariantInput[] = [];
    try {
      const raw = clean(form.get("variants"));
      variants = raw ? JSON.parse(raw) as VariantInput[] : [];
      if (!Array.isArray(variants)) variants = [];
    } catch {
      return NextResponse.json({ message: "Product variants are invalid." }, { status: 400 });
    }

    const variantDocuments = [];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const image = await uploadImage(form.get(`variantImage-${index}`) instanceof File ? form.get(`variantImage-${index}`) as File : null);
      variantDocuments.push({
        _key: randomUUID().slice(0, 12),
        _type: "object",
        title: variant.title?.trim() || undefined,
        colour: variant.colour?.trim() || undefined,
        size: variant.size?.trim() || undefined,
        sku: variant.sku?.trim() || undefined,
        price: typeof variant.price === "number" && variant.price > 0 ? variant.price : undefined,
        stockQuantity: typeof variant.stockQuantity === "number" && variant.stockQuantity >= 0 ? variant.stockQuantity : undefined,
        ...(image ? { image } : {}),
      });
    }

    const initialStock = Math.max(0, numberValue(form.get("initialStock")));
    const compareAtPrice = numberValue(form.get("compareAtPrice"));
    const rating = numberValue(form.get("rating"));
    const reviewCount = Math.max(0, Math.floor(numberValue(form.get("reviewCount"))));

    const productDocument = {
      _id: productId,
      _type: "product",
      name,
      slug: { _type: "slug", current: slug },
      sku,
      price,
      ...(compareAtPrice > 0 ? { compareAtPrice } : {}),
      ...(rating >= 4 && rating <= 4.8 ? { rating } : {}),
      ...(reviewCount > 0 ? { reviewCount } : {}),
      primaryCategory: { _type: "reference", _ref: primaryCategory },
      categories: references(jsonArray(form.get("categories")).filter((id) => id !== primaryCategory)),
      collections: references(jsonArray(form.get("collections"))),
      spaces: references(jsonArray(form.get("spaces"))),
      styles: references(jsonArray(form.get("styles"))),
      ...(heroImage ? { heroImage } : {}),
      ...(gallery.length ? { gallery } : {}),
      shortDescription: clean(form.get("shortDescription")) || undefined,
      description: clean(form.get("description")) || undefined,
      colours: textList(form.get("colours")),
      variants: variantDocuments,
      materials: textList(form.get("materials")),
      dimensions: clean(form.get("dimensions")) || undefined,
      careInstructions: clean(form.get("careInstructions")) || undefined,
      initialStock,
      featured: booleanValue(form.get("featured")),
      newArrival: booleanValue(form.get("newArrival")),
      bestSeller: booleanValue(form.get("bestSeller")),
      onSale: booleanValue(form.get("onSale")),
      available: booleanValue(form.get("available"), true),
    };

    const transaction = serverClient.transaction();
    transaction.create(productDocument);
    transaction.create({
      _id: inventoryDocumentId(productId),
      _type: "inventoryRecord",
      product: { _type: "reference", _ref: productId },
      location: clean(form.get("location")) || "Main store",
      reserved: 0,
      incoming: Math.max(0, numberValue(form.get("incoming"))),
      reorderPoint: Math.max(0, numberValue(form.get("reorderPoint"), 5)),
      unitCost: Math.max(0, numberValue(form.get("unitCost"))),
      createdAt: now,
      updatedAt: now,
    });
    await transaction.commit();

    return NextResponse.json({ ok: true, productId, slug, sku }, { status: 201 });
  } catch (cause) {
    console.error("Product creation failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Product creation failed." }, { status: 500 });
  }
}
