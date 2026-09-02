import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { serverClient } from "@/sanity/lib/serverClient";

function inventoryDocumentId(productId: string) {
  const safe = productId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inventory.${safe}`;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "on", "yes"].includes(value.toLowerCase());
  return undefined;
}

function jsonArray(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [];
  } catch {
    return [] as string[];
  }
}

function textList(value: unknown) {
  return cleanString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function references(ids: string[]) {
  return ids.map((id) => ({ _key: randomUUID().slice(0, 12), _type: "reference", _ref: id }));
}

async function uploadImage(file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (!file.type.startsWith("image/")) throw new Error(`${file.name || "Upload"} is not an image.`);
  if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name || "Image"} is larger than 12 MB.`);

  const asset = await serverClient.assets.upload("image", Buffer.from(await file.arrayBuffer()), {
    filename: file.name || `product-${Date.now()}`,
    contentType: file.type || undefined,
  });

  return {
    _type: "image",
    asset: { _type: "reference", _ref: asset._id },
  };
}

type VariantInput = {
  _key?: string;
  title?: string;
  colour?: string;
  size?: string;
  sku?: string;
  price?: number | null;
  stockQuantity?: number | null;
  existingImageAssetRef?: string;
};

type GalleryInput = { key?: string; assetRef?: string };

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  const product = await serverClient.fetch(
    `*[_type == "product" && _id == $productId][0]{
      _id,
      name,
      sku,
      "slug": slug.current,
      price,
      procurementCost,
      compareAtPrice,
      rating,
      reviewCount,
      "primaryCategory": primaryCategory._ref,
      "categories": categories[]._ref,
      "collections": collections[]._ref,
      "spaces": spaces[]._ref,
      "styles": styles[]._ref,
      "heroImage": select(defined(heroImage.asset) => {"assetRef": heroImage.asset._ref, "url": heroImage.asset->url}, null),
      "gallery": gallery[]{_key, "assetRef": asset._ref, "url": asset->url},
      shortDescription,
      description,
      colours,
      "variants": variants[]{_key,title,colour,size,sku,price,stockQuantity,"imageAssetRef":image.asset._ref,"imageUrl":image.asset->url},
      materials,
      dimensions,
      careInstructions,
      initialStock,
      ecommerceEnabled,
      posEnabled,
      featured,
      newArrival,
      bestSeller,
      onSale,
      available,
      "inventory": *[_type == "inventoryRecord" && product._ref == ^._id][0]{
        location,
        reserved,
        incoming,
        reorderPoint,
        unitCost
      }
    }`,
    { productId },
    { cache: "no-store" },
  );

  if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    let form: FormData | null = null;

    if (contentType.includes("multipart/form-data")) {
      form = await request.formData();
      for (const key of [
        "name", "shortDescription", "description", "onHand", "initialStock", "reserved", "incoming", "reorderPoint",
        "unitCost", "procurementCost", "ecommerceEnabled", "posEnabled", "retailPrice", "price", "compareAtPrice",
        "rating", "reviewCount", "location", "available", "featured", "newArrival", "bestSeller", "onSale",
        "primaryCategory", "categories", "collections", "spaces", "styles", "colours", "materials", "dimensions",
        "careInstructions", "variants", "galleryExisting",
      ]) {
        if (form.has(key)) body[key] = form.get(key);
      }
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    if (staff.role !== "ADMIN") {
      const storeEditableFields = new Set([
        "name", "shortDescription", "description", "onHand", "reserved", "incoming", "reorderPoint",
        "unitCost", "ecommerceEnabled", "posEnabled", "retailPrice", "location", "available", "bestSeller",
      ]);
      const restrictedField = Object.keys(body).find((key) => !storeEditableFields.has(key));
      if (restrictedField) {
        return NextResponse.json({ message: "Only Admin users can edit the full product catalogue." }, { status: 403 });
      }
    }

    const productPatch: Record<string, unknown> = {};
    const productUnset: string[] = [];

    if (body.name !== undefined) {
      const name = cleanString(body.name);
      if (!name) return NextResponse.json({ message: "Product name cannot be empty." }, { status: 400 });
      productPatch.name = name;
    }
    if (body.shortDescription !== undefined) productPatch.shortDescription = cleanString(body.shortDescription);
    if (body.description !== undefined) productPatch.description = cleanString(body.description);

    const stock = numericValue(body.initialStock ?? body.onHand);
    if (stock !== undefined) productPatch.initialStock = Math.max(0, stock);

    const retailPrice = numericValue(body.price ?? body.retailPrice);
    if (retailPrice !== undefined) {
      if (!(retailPrice > 0)) return NextResponse.json({ message: "Price must be greater than zero." }, { status: 400 });
      productPatch.price = retailPrice;
    }

    for (const field of ["available", "featured", "newArrival", "bestSeller", "onSale"] as const) {
      if (body[field] !== undefined) {
        const value = booleanValue(body[field]);
        if (value !== undefined) productPatch[field] = value;
      }
    }

    const ecommerceEnabled = booleanValue(body.ecommerceEnabled);
    const posEnabled = booleanValue(body.posEnabled);
    if (ecommerceEnabled !== undefined) productPatch.ecommerceEnabled = ecommerceEnabled;
    if (posEnabled !== undefined) productPatch.posEnabled = posEnabled;
    if (body.ecommerceEnabled !== undefined && body.posEnabled !== undefined && !ecommerceEnabled && !posEnabled) {
      return NextResponse.json({ message: "Select at least one sales channel: E-commerce or POS." }, { status: 400 });
    }

    const procurementCost = numericValue(body.procurementCost ?? body.unitCost);
    if (procurementCost !== undefined) productPatch.procurementCost = Math.max(0, procurementCost);

    if (body.compareAtPrice !== undefined) {
      const value = numericValue(body.compareAtPrice);
      if (value !== undefined && value > 0) productPatch.compareAtPrice = value;
      else productUnset.push("compareAtPrice");
    }
    if (body.rating !== undefined) {
      const value = numericValue(body.rating);
      if (value !== undefined && value >= 4 && value <= 4.8) productPatch.rating = value;
      else productUnset.push("rating");
    }
    if (body.reviewCount !== undefined) {
      const value = numericValue(body.reviewCount);
      if (value !== undefined && value > 0) productPatch.reviewCount = Math.floor(value);
      else productUnset.push("reviewCount");
    }

    if (body.primaryCategory !== undefined) {
      const primaryCategory = cleanString(body.primaryCategory);
      if (!primaryCategory) return NextResponse.json({ message: "Primary category is required." }, { status: 400 });
      productPatch.primaryCategory = { _type: "reference", _ref: primaryCategory };
    }
    if (body.categories !== undefined) {
      const primaryCategory = cleanString(body.primaryCategory);
      productPatch.categories = references(jsonArray(body.categories).filter((categoryId) => categoryId !== primaryCategory));
    }
    if (body.collections !== undefined) productPatch.collections = references(jsonArray(body.collections));
    if (body.spaces !== undefined) productPatch.spaces = references(jsonArray(body.spaces));
    if (body.styles !== undefined) productPatch.styles = references(jsonArray(body.styles));
    if (body.colours !== undefined) productPatch.colours = textList(body.colours);
    if (body.materials !== undefined) productPatch.materials = textList(body.materials);
    if (body.dimensions !== undefined) productPatch.dimensions = cleanString(body.dimensions);
    if (body.careInstructions !== undefined) productPatch.careInstructions = cleanString(body.careInstructions);

    if (form) {
      const heroCandidate = form.get("heroImage");
      const heroImage = await uploadImage(heroCandidate instanceof File && heroCandidate.size > 0 ? heroCandidate : null);
      if (heroImage) productPatch.heroImage = heroImage;

      if (form.has("galleryExisting") || form.getAll("galleryImages").some((entry) => entry instanceof File && entry.size > 0)) {
        let existingGallery: GalleryInput[] = [];
        try {
          const raw = cleanString(form.get("galleryExisting"));
          existingGallery = raw ? JSON.parse(raw) as GalleryInput[] : [];
          if (!Array.isArray(existingGallery)) existingGallery = [];
        } catch {
          return NextResponse.json({ message: "Existing gallery data is invalid." }, { status: 400 });
        }

        const retained = existingGallery
          .filter((image) => typeof image?.assetRef === "string" && image.assetRef.trim())
          .map((image) => ({
            _key: image.key?.trim() || randomUUID().slice(0, 12),
            _type: "image",
            asset: { _type: "reference", _ref: image.assetRef!.trim() },
          }));
        const newFiles = form.getAll("galleryImages").filter((entry): entry is File => entry instanceof File && entry.size > 0);
        const uploaded = (await Promise.all(newFiles.map((file) => uploadImage(file))))
          .filter((image): image is NonNullable<typeof image> => Boolean(image))
          .map((image) => ({ ...image, _key: randomUUID().slice(0, 12) }));
        productPatch.gallery = [...retained, ...uploaded];
      }

      if (form.has("variants")) {
        let variants: VariantInput[] = [];
        try {
          const raw = cleanString(form.get("variants"));
          variants = raw ? JSON.parse(raw) as VariantInput[] : [];
          if (!Array.isArray(variants)) variants = [];
        } catch {
          return NextResponse.json({ message: "Product variants are invalid." }, { status: 400 });
        }

        const variantDocuments = [];
        for (let index = 0; index < variants.length; index += 1) {
          const variant = variants[index];
          const candidate = form.get(`variantImage-${index}`);
          const uploadedImage = await uploadImage(candidate instanceof File && candidate.size > 0 ? candidate : null);
          const existingImage = !uploadedImage && variant.existingImageAssetRef?.trim()
            ? { _type: "image", asset: { _type: "reference", _ref: variant.existingImageAssetRef.trim() } }
            : undefined;
          const image = uploadedImage || existingImage;
          variantDocuments.push({
            _key: variant._key?.trim() || randomUUID().slice(0, 12),
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
        productPatch.variants = variantDocuments;
      }
    }

    const inventoryPatch: Record<string, unknown> = {};
    if (body.location !== undefined) inventoryPatch.location = cleanString(body.location) || "Main store";
    const reserved = numericValue(body.reserved);
    if (reserved !== undefined) inventoryPatch.reserved = Math.max(0, reserved);
    const incoming = numericValue(body.incoming);
    if (incoming !== undefined) inventoryPatch.incoming = Math.max(0, incoming);
    const reorderPoint = numericValue(body.reorderPoint);
    if (reorderPoint !== undefined) inventoryPatch.reorderPoint = Math.max(0, reorderPoint);
    if (procurementCost !== undefined) inventoryPatch.unitCost = Math.max(0, procurementCost);

    const transaction = serverClient.transaction();

    if (Object.keys(productPatch).length > 0 || productUnset.length > 0) {
      transaction.patch(productId, (patch) => {
        let next = patch;
        if (Object.keys(productPatch).length > 0) next = next.set(productPatch);
        if (productUnset.length > 0) next = next.unset([...new Set(productUnset)]);
        return next;
      });
    }

    if (Object.keys(inventoryPatch).length > 0) {
      const inventoryId = inventoryDocumentId(productId);
      transaction.createIfNotExists({
        _id: inventoryId,
        _type: "inventoryRecord",
        product: { _type: "reference", _ref: productId },
        location: "Unassigned",
        reserved: 0,
        incoming: 0,
        reorderPoint: 5,
        unitCost: 0,
      });
      transaction.patch(inventoryId, (patch) => patch.set(inventoryPatch));
    }

    await transaction.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product update failed:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Product update failed." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  try {
    const blockers = await serverClient.fetch<Array<{ _id: string; _type: string }>>(
      `*[references($productId) && !(_type in ["inventoryRecord", "inventoryMovement", "restockRequest"])]{_id,_type}`,
      { productId },
      { cache: "no-store" },
    );

    if (blockers.length > 0) {
      const types = [...new Set(blockers.map((item) => item._type))].join(", ");
      return NextResponse.json(
        {
          message: `This product is already referenced by ${types}. To preserve order/content history, hide it from E-commerce/POS instead of deleting it.`,
        },
        { status: 409 },
      );
    }

    const dependentIds = await serverClient.fetch<string[]>(
      `*[references($productId) && _type in ["inventoryRecord", "inventoryMovement", "restockRequest"]]._id`,
      { productId },
      { cache: "no-store" },
    );

    const transaction = serverClient.transaction();
    for (const dependentId of dependentIds) transaction.delete(dependentId);
    transaction.delete(productId);
    transaction.delete(`drafts.${productId}`);
    await transaction.commit();

    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("Product deletion failed:", cause);
    return NextResponse.json({ message: cause instanceof Error ? cause.message : "Product deletion failed." }, { status: 500 });
  }
}
