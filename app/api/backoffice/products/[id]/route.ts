import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { getApiStaff } from "@/lib/auth/api-authorization";
import { toSanityServiceError } from "@/lib/sanity-error";
import { serverClient } from "@/sanity/lib/serverClient";
import { adjustLocationBalance, findLocationBalance, locationOnHand, locationStoreId, type LocationBalance } from "@/lib/inventory/location-stock";

function inventoryDocumentId(productId: string) {
  const safe = productId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `inventory.${safe}`;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanProductName(value: unknown) {
  return cleanString(value).replace(/\s+/g, " ");
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
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  const product = await serverClient.fetch(
    `*[_type == "product" && _id == $productId][0]{
      _id,
      _rev,
      name,
      sku,
      "slug": slug.current,
      price,
      wholesalePrice,
      wholesaleMinQuantity,
      procurementCost,
      compareAtPrice,
      salePrice,
      saleStartAt,
      saleEndAt,
      rating,
      reviewCount,
      "primaryCategory": primaryCategory._ref,
      "categories": categories[]._ref,
      "collections": collections[]._ref,
      "spaces": spaces[]._ref,
      "styles": styles[]._ref,
      "pairings": pairings[]._ref,
      "merchandisedSamples": merchandisedSamples[]._ref,
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
        _rev,
        location,
        "defaultStoreId": defaultStore._ref,
        "defaultStoreName": defaultStore->name,
        "defaultStoreCode": defaultStore->code,
        "defaultStoreType": defaultStore->locationType,
        reserved,
        incoming,
        reorderPoint,
        unitCost,
        "locationBalances": locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}
      }
    }`,
    { productId },
    { cache: "no-store" },
  );

  if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
  if (staff.role === "MANAGER") {
    if (!staff.storeLocationId || product.inventory?.defaultStoreId !== staff.storeLocationId) {
      return NextResponse.json({ message: "This product is not assigned to your store." }, { status: 403 });
    }
  }
  // Managers may see stock levels but never procurement/production cost.
  // Redact at the API boundary, not only in the product editor.
  if (staff.role === "MANAGER") {
    const { procurementCost: _cost, inventory, ...safe } = product;
    const { unitCost: _unitCost, ...safeInventory } = inventory || {};
    return NextResponse.json({ product: { ...safe, inventory: inventory ? safeInventory : null } });
  }
  return NextResponse.json({ product });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getApiStaff(["ADMIN", "STORE", "MANAGER", "STORE_STAFF"]);
  if (!staff.ok) return NextResponse.json({ message: "Access denied." }, { status: staff.status });

  const { id } = await context.params;
  const productId = decodeURIComponent(id);

  if (staff.role === "MANAGER") {
    const assignedStoreId = await serverClient.fetch<string | null>(
      `*[_type == "inventoryRecord" && product._ref == $productId][0].defaultStore._ref`,
      { productId }, { cache: "no-store" },
    );
    if (!staff.storeLocationId || assignedStoreId !== staff.storeLocationId) {
      return NextResponse.json({ message: "Managers can only edit products assigned to their store." }, { status: 403 });
    }
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown> = {};
    let form: FormData | null = null;

    if (contentType.includes("multipart/form-data")) {
      form = await request.formData();
      for (const key of [
        "name", "shortDescription", "description", "onHand", "initialStock", "reserved", "incoming", "reorderPoint",
        "unitCost", "procurementCost", "ecommerceEnabled", "posEnabled", "retailPrice", "price", "wholesalePrice", "wholesaleMinQuantity", "compareAtPrice", "salePrice",
        "rating", "reviewCount", "location", "storeLocationId", "available", "featured", "newArrival", "bestSeller", "onSale", "saleStartAt", "saleEndAt",
        "primaryCategory", "categories", "collections", "spaces", "styles", "pairings", "merchandisedSamples", "colours", "materials", "dimensions",
        "careInstructions", "variants", "galleryExisting", "productRevision", "inventoryRevision",
      ]) {
        if (form.has(key)) body[key] = form.get(key);
      }
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    if (staff.role === "STORE_STAFF") {
      const salesStaffEditableFields = new Set(["name", "shortDescription", "description"]);
      const restrictedField = Object.keys(body).find((key) => !salesStaffEditableFields.has(key));
      if (restrictedField) {
        return NextResponse.json({ message: "Sales Staff can edit catalogue descriptions only. Prices and inventory quantities are manager-only." }, { status: 403 });
      }
    } else if (staff.role === "MANAGER") {
      if (!staff.storeLocationId || cleanString(body.storeLocationId) !== staff.storeLocationId) {
        return NextResponse.json({ message: "Managers can only edit products at their assigned store." }, { status: 403 });
      }
      const managerEditableFields = new Set([
        "name", "shortDescription", "description",
        "ecommerceEnabled", "posEnabled", "retailPrice", "price", "wholesalePrice", "wholesaleMinQuantity", "compareAtPrice", "salePrice",
        "rating", "reviewCount", "storeLocationId", "available", "featured", "newArrival", "bestSeller", "onSale", "saleStartAt", "saleEndAt",
        "primaryCategory", "categories", "collections", "spaces", "styles", "pairings", "merchandisedSamples", "colours", "materials", "dimensions",
        "careInstructions", "variants", "galleryExisting", "productRevision", "inventoryRevision",
      ]);
      const restrictedField = Object.keys(body).find((key) => !managerEditableFields.has(key));
      if (restrictedField) return NextResponse.json({ message: `Managers cannot change ${restrictedField}.` }, { status: 403 });
    } else if (staff.role !== "ADMIN") {
      const storeEditableFields = new Set([
        "name", "shortDescription", "description", "onHand", "reserved", "incoming", "reorderPoint",
        "unitCost", "ecommerceEnabled", "posEnabled", "retailPrice", "location", "storeLocationId", "available", "bestSeller",
      ]);
      const restrictedField = Object.keys(body).find((key) => !storeEditableFields.has(key));
      if (restrictedField) {
        return NextResponse.json({ message: "Only Admin users can edit the full product catalogue." }, { status: 403 });
      }
    }

    const productPatch: Record<string, unknown> = {};
    const productUnset: string[] = [];

    if (body.name !== undefined) {
      const name = cleanProductName(body.name);
      if (!name) return NextResponse.json({ message: "Product name cannot be empty." }, { status: 400 });
      productPatch.name = name;
    }
    if (body.shortDescription !== undefined) productPatch.shortDescription = cleanString(body.shortDescription);
    if (body.description !== undefined) productPatch.description = cleanString(body.description);

    const stock = numericValue(body.initialStock ?? body.onHand);
    if (stock !== undefined) productPatch.initialStock = Math.max(0, stock);

    const retailPrice = numericValue(body.price ?? body.retailPrice);
    if (retailPrice !== undefined) {
      if (!(retailPrice > 0)) return NextResponse.json({ message: "Retail price must be greater than zero." }, { status: 400 });
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

    const wholesaleFieldsProvided = body.wholesalePrice !== undefined || body.wholesaleMinQuantity !== undefined;
    if (wholesaleFieldsProvided) {
      const wholesalePriceText = cleanString(body.wholesalePrice);
      const wholesaleQuantityText = cleanString(body.wholesaleMinQuantity);
      if (!wholesalePriceText && !wholesaleQuantityText) {
        productUnset.push("wholesalePrice", "wholesaleMinQuantity");
      } else {
        const wholesalePrice = numericValue(body.wholesalePrice);
        const wholesaleMinQuantity = numericValue(body.wholesaleMinQuantity);
        if (!(wholesalePrice && wholesalePrice > 0)) {
          return NextResponse.json({ message: "Wholesale price must be greater than zero." }, { status: 400 });
        }
        if (!(wholesaleMinQuantity && Math.floor(wholesaleMinQuantity) >= 2)) {
          return NextResponse.json({ message: "Wholesale quantity threshold must be at least 2." }, { status: 400 });
        }
        const currentRetailPrice = retailPrice ?? await serverClient.fetch<number | null>(
          `*[_type == "product" && _id == $productId][0].price`,
          { productId },
          { cache: "no-store" },
        );
        if (!(currentRetailPrice && wholesalePrice < currentRetailPrice)) {
          return NextResponse.json({ message: "Wholesale price must be lower than the retail price." }, { status: 400 });
        }
        productPatch.wholesalePrice = wholesalePrice;
        productPatch.wholesaleMinQuantity = Math.floor(wholesaleMinQuantity);
      }
    }

    const procurementCost = numericValue(body.procurementCost ?? body.unitCost);
    if (procurementCost !== undefined) productPatch.procurementCost = Math.max(0, procurementCost);

    if (body.salePrice !== undefined) {
      const value = numericValue(body.salePrice);
      const retail = numericValue(body.retailPrice ?? body.price);
      if (value !== undefined && value > 0 && retail !== undefined && value >= retail) {
        return NextResponse.json({ message: "Sale price must be lower than the retail price." }, { status: 400 });
      }
      if (value !== undefined && value > 0) productPatch.salePrice = value; else productUnset.push("salePrice");
    }

    if (body.saleStartAt !== undefined || body.saleEndAt !== undefined) {
      const start = cleanString(body.saleStartAt);
      const end = cleanString(body.saleEndAt);
      if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
        return NextResponse.json({ message: "Sale end must be after sale start." }, { status: 400 });
      }
      if (start) productPatch.saleStartAt = start; else productUnset.push("saleStartAt");
      if (end) productPatch.saleEndAt = end; else productUnset.push("saleEndAt");
    }

    if (body.compareAtPrice !== undefined) {
      const value = numericValue(body.compareAtPrice);
      const retail = numericValue(body.retailPrice ?? body.price);
      if (value !== undefined && value > 0 && retail !== undefined && value <= retail) {
        return NextResponse.json({ message: "Compare-at price must be higher than the retail price." }, { status: 400 });
      }
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
    if (body.pairings !== undefined) productPatch.pairings = references(jsonArray(body.pairings).filter((id) => id !== productId));
    if (body.merchandisedSamples !== undefined) productPatch.merchandisedSamples = references(jsonArray(body.merchandisedSamples).filter((id) => id !== productId));
    if (body.colours !== undefined) productPatch.colours = textList(body.colours);
    if (body.materials !== undefined) productPatch.materials = textList(body.materials);
    if (body.dimensions !== undefined) productPatch.dimensions = cleanString(body.dimensions);
    if (body.careInstructions !== undefined) productPatch.careInstructions = cleanString(body.careInstructions);

    if (form) {
      const heroCandidate = form.get("heroImage");
      const heroImage = await uploadImage(heroCandidate instanceof File && heroCandidate.size > 0 ? heroCandidate : null);
      if (heroImage) productPatch.heroImage = heroImage;
    }

    const hasNewGalleryFiles = Boolean(
      form?.getAll("galleryImages").some((entry) => entry instanceof File && entry.size > 0),
    );
    // Image deletion is restricted to ADMIN/STORE even through the legacy
    // product-edit PATCH. A Manager may add/replace images, but must retain
    // every existing gallery image reference and its key.
    if (staff.role === "MANAGER" && body.galleryExisting !== undefined) {
      const existing = await serverClient.fetch<Array<{ _key?: string; assetRef?: string }>>(
        `*[_type == "product" && _id == $productId][0].gallery[]{_key,"assetRef":asset._ref}`,
        { productId }, { cache: "no-store" },
      );
      let retained: Array<{ key?: string; assetRef?: string }>;
      try { retained = JSON.parse(cleanString(body.galleryExisting)) as Array<{ key?: string; assetRef?: string }>; }
      catch { return NextResponse.json({ message: "Invalid gallery selection." }, { status: 400 }); }
      if (!Array.isArray(retained) || (existing || []).some((image) =>
        !retained.some((kept) => kept.key === image._key && kept.assetRef === image.assetRef)
      )) return NextResponse.json({ message: "Only Admin or Store Manager may delete gallery images." }, { status: 403 });
    }
    if (body.galleryExisting !== undefined || hasNewGalleryFiles) {
      let existingGallery: GalleryInput[] = [];
      try {
        const raw = cleanString(body.galleryExisting);
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
      const newFiles = form
        ? form.getAll("galleryImages").filter((entry): entry is File => entry instanceof File && entry.size > 0)
        : [];
      const uploaded = (await Promise.all(newFiles.map((file) => uploadImage(file))))
        .filter((image): image is NonNullable<typeof image> => Boolean(image))
        .map((image) => ({ ...image, _key: randomUUID().slice(0, 12) }));
      productPatch.gallery = [...retained, ...uploaded];
    }

    let managerProductRevision: string | undefined;
    if (body.variants !== undefined) {
      let variants: VariantInput[] = [];
      try {
        const raw = cleanString(body.variants);
        variants = raw ? JSON.parse(raw) as VariantInput[] : [];
        if (!Array.isArray(variants)) variants = [];
      } catch {
        return NextResponse.json({ message: "Product variants are invalid." }, { status: 400 });
      }

      const managerVariants = staff.role === "MANAGER";
      const currentVariantStock = new Map<string, number>();
      const currentVariantImages = new Map<string, string>();
      if (managerVariants) {
        const current = await serverClient.fetch<{ _rev: string; initialStock?: number; variants?: Array<{ _key?: string; stockQuantity?: number; imageAssetRef?: string }> } | null>(
          `*[_type == "product" && _id == $id][0]{_rev,initialStock,variants[]{_key,stockQuantity,"imageAssetRef":image.asset._ref}}`,
          { id: productId }, { cache: "no-store" },
        );
        if (!current) return NextResponse.json({ message: "Product not found." }, { status: 404 });
        if (!body.productRevision || body.productRevision !== current._rev) {
          return NextResponse.json({ message: "This product changed. Reload before editing its variants." }, { status: 409 });
        }
        managerProductRevision = current._rev;
        for (const variant of current.variants || []) {
          if (variant._key) currentVariantStock.set(variant._key, Number(variant.stockQuantity || 0));
          if (variant._key && variant.imageAssetRef) currentVariantImages.set(variant._key, variant.imageAssetRef);
        }
        if ([...currentVariantImages].some(([key, assetRef]) => {
          const index = variants.findIndex((variant) => variant._key === key);
          if (index < 0) return true;
          const replacement = form?.get(`variantImage-${index}`);
          return variants[index].existingImageAssetRef !== assetRef && !(replacement instanceof File && replacement.size > 0);
        })) return NextResponse.json({ message: "Only Admin or Store Manager may delete variant images." }, { status: 403 });
        if (variants.some(v => v.stockQuantity !== undefined && v.stockQuantity !== null)) {
          return NextResponse.json({ message: "Managers cannot edit variant stock quantities." }, { status: 403 });
        }
        if (!(current.variants || []).length && variants.length && Number(current.initialStock || 0) > 0) {
          return NextResponse.json({ message: "Move or allocate existing stock before changing this product to variants." }, { status: 403 });
        }
        const requestedKeys = new Set(variants.map(v => v._key).filter(Boolean));
        if (requestedKeys.size !== variants.filter(x => x._key).length) {
          return NextResponse.json({ message: "Every variant must have a unique identifier." }, { status: 400 });
        }
        if ([...currentVariantStock].some(([id, amount]) => !requestedKeys.has(id) && amount > 0)) {
          return NextResponse.json({ message: "Managers cannot remove a variant while it has stock." }, { status: 403 });
        }
        const removedKeys = [...currentVariantStock.keys()].filter(id => !requestedKeys.has(id));
        if (removedKeys.length) {
          const allocated = await serverClient.fetch<Array<{ locationBalances?: Array<{ variants?: Array<{ variantId?: string; onHand?: number; incoming?: number }> }> }>>(
            `*[_type == "inventoryRecord" && product._ref == $id]{locationBalances[]{variants[]{variantId,onHand,incoming}}}`,
            { id: productId }, { cache: "no-store" },
          );
          if (allocated.some(record => (record.locationBalances || []).some(balance =>
            (balance.variants || []).some(v => removedKeys.includes(v.variantId || "") &&
              (Number(v.onHand || 0) > 0 || Number(v.incoming || 0) > 0))))) {
            return NextResponse.json({ message: "Managers cannot remove a variant with allocated or incoming stock." }, { status: 403 });
          }
        }
      }
      const variantDocuments = [];
      for (let index = 0; index < variants.length; index += 1) {
        const variant = variants[index];
        const candidate = form?.get(`variantImage-${index}`);
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
          stockQuantity: managerVariants
            ? currentVariantStock.get(variant._key || "") ?? 0
            : typeof variant.stockQuantity === "number" && variant.stockQuantity >= 0 ? variant.stockQuantity : undefined,
          ...(image ? { image } : {}),
        });
      }
      productPatch.variants = variantDocuments;
      if (variantDocuments.length > 0 && !managerVariants) {
        productPatch.initialStock = variantDocuments.reduce(
          (total, variant) => total + (typeof variant.stockQuantity === "number" ? variant.stockQuantity : 0),
          0,
        );
      }
    }

    const inventoryPatch: Record<string, unknown> = {};
    const inventoryUnset: string[] = [];
    if (body.storeLocationId !== undefined) {
      const storeLocationId = cleanString(body.storeLocationId);
      if (storeLocationId) {
        const storeLocation = await serverClient.fetch<{ _id: string; name?: string } | null>(
          `*[_type == "storeLocation" && _id == $storeLocationId && active != false][0]{_id,name}`,
          { storeLocationId },
          { cache: "no-store" },
        );
        if (!storeLocation) return NextResponse.json({ message: "Select an active inventory location." }, { status: 400 });
        inventoryPatch.defaultStore = { _type: "reference", _ref: storeLocation._id };
        inventoryPatch.location = storeLocation.name || "Assigned store";
      } else {
        inventoryPatch.location = "Unassigned";
        inventoryUnset.push("defaultStore");
      }
    } else if (body.location !== undefined) {
      inventoryPatch.location = cleanString(body.location) || "Unassigned";
    }
    const reserved = numericValue(body.reserved);
    if (reserved !== undefined) inventoryPatch.reserved = Math.max(0, reserved);
    const incoming = numericValue(body.incoming);
    if (incoming !== undefined) inventoryPatch.incoming = Math.max(0, incoming);
    const reorderPoint = numericValue(body.reorderPoint);
    if (reorderPoint !== undefined) inventoryPatch.reorderPoint = Math.max(0, reorderPoint);
    if (procurementCost !== undefined) inventoryPatch.unitCost = Math.max(0, procurementCost);

    // Variant metadata saves must be revision-bound too: an in-flight POS sale
    // must not have its newly reduced variant quantities overwritten.
    let stockProductRevision: string | undefined = typeof managerProductRevision === "string" ? managerProductRevision : undefined;
    let stockInventoryRevision: string | undefined;
    let stockInventoryId: string | undefined;
    // Product quantities are company totals, while POS uses locationBalances. On an
    // explicit editor stock submission, place only the *unallocated* remainder at
    // the selected default store. Never take stock away from another branch.
    if (staff.role !== "MANAGER" && (productPatch.initialStock !== undefined || productPatch.variants !== undefined)) {
      const [currentProduct, inventoryRecords] = await Promise.all([
        serverClient.fetch<{ _rev: string; initialStock?: number; variants?: Array<{ _key?: string; stockQuantity?: number }> } | null>(
          `*[_type == "product" && _id == $id][0]{_rev,initialStock,variants[]{_key,stockQuantity}}`, { id: productId }, { cache: "no-store" },
        ),
        serverClient.fetch<Array<{ _id: string; _rev: string; defaultStoreId?: string; locationBalances?: LocationBalance[] }>>(
          `*[_type == "inventoryRecord" && product._ref == $id]{_id,_rev,"defaultStoreId":defaultStore._ref,locationBalances[]{_key,store,storeId,storeName,storeCode,onHand,incoming,variants[]{_key,variantId,variantLabel,onHand,incoming}}}`,
          { id: productId }, { cache: "no-store" },
        ),
      ]);
      if (!currentProduct) return NextResponse.json({ message: "Product not found." }, { status: 404 });
      if (inventoryRecords.length > 1) {
        return NextResponse.json({ message: "Multiple inventory records were found. Resolve this conflict before editing stock." }, { status: 409 });
      }
      if (body.productRevision && body.productRevision !== currentProduct._rev) {
        return NextResponse.json({ message: "This product changed since you opened it (possibly due to a sale). Reload before editing stock." }, { status: 409 });
      }
      if (body.inventoryRevision && body.inventoryRevision !== inventoryRecords[0]?._rev) {
        return NextResponse.json({ message: "Store inventory changed since you opened this product. Reload before editing stock." }, { status: 409 });
      }
      const inventory = inventoryRecords[0];
      const selectedStoreId = cleanString(body.storeLocationId) || inventory?.defaultStoreId || "";
      if (!selectedStoreId) return NextResponse.json({ message: "Assign this product to a store before saving stock quantities." }, { status: 400 });
      const store = await serverClient.fetch<{ _id: string; name: string; code?: string } | null>(
        `*[_type == "storeLocation" && _id == $id && active != false][0]{_id,name,code}`, { id: selectedStoreId }, { cache: "no-store" },
      );
      if (!store) return NextResponse.json({ message: "Selected inventory store is not active." }, { status: 400 });
      const balances = inventory?.locationBalances || [];
      const storeSnapshot = { id: store._id, name: store.name, code: store.code };
      let nextBalances = balances;
      if (Array.isArray(productPatch.variants) && productPatch.variants.length > 0) {
        const documents = productPatch.variants as Array<{ _key: string; title?: string; colour?: string; size?: string; stockQuantity?: number }>;
        const keys = new Set(documents.map((variant) => variant._key));
        if (keys.size !== documents.length || documents.some((variant) => typeof variant.stockQuantity !== "number")) {
          return NextResponse.json({ message: "Every variant must have a unique identifier and a stock quantity." }, { status: 400 });
        }
        for (const balance of balances) {
          if (balance.variants?.some((variant) => !keys.has(variant.variantId || "") && Number(variant.onHand || 0) > 0)) {
            return NextResponse.json({ message: "A stocked variant cannot be removed until its location stock is transferred or cleared." }, { status: 409 });
          }
          if ((!balance.variants || balance.variants.length === 0) && Number(balance.onHand || 0) > 0) {
            return NextResponse.json({ message: "Move existing non-variant location stock before converting this product to variants." }, { status: 409 });
          }
        }
        for (const variant of documents) {
          const atOtherStores = balances.filter((row) => locationStoreId(row) !== store._id).reduce(
            (sum, row) => sum + locationOnHand(row, variant._key), 0,
          );
          const desired = variant.stockQuantity || 0;
          if (desired < atOtherStores) return NextResponse.json({ message: `Variant ${variant.title || variant._key} has ${atOtherStores} units at other stores. The company total cannot be lower.` }, { status: 409 });
          const current = locationOnHand(findLocationBalance(nextBalances, store._id), variant._key);
          nextBalances = adjustLocationBalance(nextBalances, storeSnapshot, {
            variantId: variant._key,
            variantLabel: variant.title || [variant.colour, variant.size].filter(Boolean).join(" / "),
            onHandDelta: desired - atOtherStores - current,
          });
        }
      } else if ((productPatch.variants !== undefined && (productPatch.variants as unknown[]).length === 0) || body.initialStock !== undefined) {
        if ((currentProduct.variants || []).length && balances.some((row) => (row.variants || []).some((variant) => Number(variant.onHand || 0) > 0))) {
          return NextResponse.json({ message: "Transfer or clear variant inventory before switching to a single stock quantity." }, { status: 409 });
        }
        const other = balances.filter((row) => locationStoreId(row) !== store._id).reduce((sum, row) => sum + locationOnHand(row), 0);
        const desired = Number(productPatch.initialStock ?? currentProduct.initialStock ?? 0);
        if (desired < other) return NextResponse.json({ message: `Other stores have ${other} units; company stock cannot be less.` }, { status: 409 });
        const current = locationOnHand(findLocationBalance(nextBalances, store._id));
        nextBalances = adjustLocationBalance(nextBalances, storeSnapshot, { onHandDelta: desired - other - current });
      }
      if (body.incoming !== undefined && (!currentProduct.variants || currentProduct.variants.length === 0)) {
        const totalIncoming = numericValue(body.incoming);
        if (totalIncoming === undefined || totalIncoming < 0) {
          return NextResponse.json({ message: "Incoming stock must be zero or higher." }, { status: 400 });
        }
        const incomingAtOthers = balances.filter((row) => locationStoreId(row) !== store._id).reduce(
          (sum, row) => sum + Math.max(0, Number(row.incoming || 0)), 0,
        );
        if (totalIncoming < incomingAtOthers) {
          return NextResponse.json({ message: `Other stores have ${incomingAtOthers} incoming units; total incoming cannot be lower.` }, { status: 409 });
        }
        const current = Math.max(0, Number(findLocationBalance(nextBalances, store._id)?.incoming || 0));
        nextBalances = adjustLocationBalance(nextBalances, storeSnapshot, { incomingDelta: totalIncoming - incomingAtOthers - current });
      }
      inventoryPatch.locationBalances = nextBalances;
      inventoryPatch.defaultStore = { _type: "reference", _ref: store._id };
      inventoryPatch.location = store.name;
      // Check revisions to avoid overwriting a sale that happened while editing.
      stockProductRevision = currentProduct._rev;
      stockInventoryRevision = inventory?._rev;
      stockInventoryId = inventory?._id;
    }

    const transaction = serverClient.transaction();

    if (Object.keys(productPatch).length > 0 || productUnset.length > 0) {
      transaction.patch(productId, (patch) => {
        let next = stockProductRevision ? patch.ifRevisionId(stockProductRevision) : patch;
        if (Object.keys(productPatch).length > 0) next = next.set(productPatch);
        if (productUnset.length > 0) next = next.unset([...new Set(productUnset)]);
        return next;
      });
    }

    if (Object.keys(inventoryPatch).length > 0 || inventoryUnset.length > 0) {
      const inventoryId = stockInventoryId || inventoryDocumentId(productId);
      if (!stockInventoryId) transaction.createIfNotExists({
        _id: inventoryId,
        _type: "inventoryRecord",
        product: { _type: "reference", _ref: productId },
        location: "Unassigned",
        reserved: 0,
        incoming: 0,
        reorderPoint: 5,
        unitCost: 0,
      });
      transaction.patch(inventoryId, (patch) => {
        let next = stockInventoryRevision ? patch.ifRevisionId(stockInventoryRevision) : patch;
        if (Object.keys(inventoryPatch).length > 0) next = next.set(inventoryPatch);
        if (inventoryUnset.length > 0) next = next.unset(inventoryUnset);
        return next;
      });
    }

    await transaction.commit();
    revalidatePath("/");
    revalidatePath("/shop");

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Product update failed:", error);
    const detail = error instanceof Error ? error.message : "";
    if (/revision.*(mismatch|changed|conflict)|conflict.*revision/i.test(detail)) {
      return NextResponse.json({ message: "Inventory changed while you were editing. Reload the product and retry." }, { status: 409 });
    }
    const failure = toSanityServiceError(error, "Product update failed.");
    return NextResponse.json({ message: failure.message }, { status: failure.status });
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
    revalidatePath("/");
    revalidatePath("/shop");

    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error("Product deletion failed:", cause);
    const failure = toSanityServiceError(cause, "Product deletion failed.");
    return NextResponse.json({ message: failure.message }, { status: failure.status });
  }
}
